const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// sử dụng REST Client extension để test

// Middleware parse JSON body
app.use(express.json());

let serverStarted = false;

function startHttpServer() {
  if (serverStarted) return;

  serverStarted = true;
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

async function connectMongoWithRetry() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    startHttpServer();
  } catch (err) {
    console.error('Could not connect to MongoDB', err);
    setTimeout(connectMongoWithRetry, 5000);
  }
}

// Schema & Model
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age:  { type: Number, required: true, min: 0 },
    email:{ type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }   // tự thêm createdAt & updatedAt
);

const User = mongoose.model('User', userSchema);

// Helper: bọc response thống nhất
const ok   = (res, data, msg = 'Success', code = 200) =>
  res.status(code).json({ success: true,  message: msg,  data });

const fail = (res, msg = 'Error', code = 400) =>
  res.status(code).json({ success: false, message: msg,  data: null });

// Root
app.get('/', (_req, res) => {
  res.json({
    message: 'User CRUD API',
    endpoints: {
      'GET    /api/users':       'Lấy danh sách tất cả user',
      'GET    /api/users/:id':   'Lấy chi tiết 1 user',
      'POST   /api/users':       'Tạo user mới',
      'PUT    /api/users/:id':   'Cập nhật user',
      'DELETE /api/users/:id':   'Xóa user',
    },
  });
});

// 1. GET ALL  –  Lấy danh sách user
app.get('/api/users', async (_req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    ok(res, { total: users.length, users }, 'Lấy danh sách thành công');
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// 2. GET ONE  –  Xem chi tiết 1 user
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 'Không tìm thấy user', 404);
    ok(res, { user }, 'Lấy thông tin thành công');
  } catch (err) {
    // ID sai định dạng ObjectId
    if (err.name === 'CastError') return fail(res, 'ID không hợp lệ', 400);
    fail(res, err.message, 500);
  }
});

// 3. POST  –  Tạo user mới
//    Body: { "name": "...", "age": 25, "email": "..." }
app.post('/api/users', async (req, res) => {
  try {
    const { name, age, email } = req.body;
    if (!name || age === undefined || !email)
      return fail(res, 'Thiếu thông tin: name, age, email là bắt buộc', 400);

    const user = await User.create({ name, age, email });
    ok(res, { user }, 'Tạo user thành công', 201);
  } catch (err) {
    // Duplicate email
    if (err.code === 11000) return fail(res, 'Email đã tồn tại', 409);
    fail(res, err.message, 500);
  }
});

// 4. PUT  –  Cập nhật user
//    Body: { "name": "...", "age": 30 }  (có thể gửi từng field)
app.put('/api/users/:id', async (req, res) => {
  try {
    const { name, age, email } = req.body;
    const updateFields = {};
    if (name  !== undefined) updateFields.name  = name;
    if (age   !== undefined) updateFields.age   = age;
    if (email !== undefined) updateFields.email = email;

    if (Object.keys(updateFields).length === 0)
      return fail(res, 'Không có dữ liệu để cập nhật', 400);

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }   // new: trả về doc đã cập nhật
    );
    if (!user) return fail(res, 'Không tìm thấy user', 404);
    ok(res, { user }, 'Cập nhật thành công');
  } catch (err) {
    if (err.name  === 'CastError') return fail(res, 'ID không hợp lệ', 400);
    if (err.code  === 11000)       return fail(res, 'Email đã tồn tại', 409);
    fail(res, err.message, 500);
  }
});

// 5. DELETE  –  Xóa user
app.delete('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return fail(res, 'Không tìm thấy user', 404);
    ok(res, { user }, 'Xóa user thành công');
  } catch (err) {
    if (err.name === 'CastError') return fail(res, 'ID không hợp lệ', 400);
    fail(res, err.message, 500);
  }
});

// 404 fallback
app.use((_req, res) => {
  fail(res, 'Route không tồn tại', 404);
});

connectMongoWithRetry();