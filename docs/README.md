# Quản lý công việc trường học

Website minh họa quản lý công việc, dùng HTML/CSS/JavaScript, Supabase Auth, PostgreSQL RLS và Edge Function.

## Chạy local

Yêu cầu Node.js >=22.

```sh
npm start
```

Mở http://localhost:3000/code.html. Máy chủ chỉ phục vụ tài nguyên frontend trong allowlist.

```sh
npm test
```

Kiểm thử browser tùy chọn cần Playwright và Chrome: `npm run test:browser`.

## Danh tính và quyền

Đăng nhập bằng tài khoản Supabase đã được xác nhận email. Đăng ký yêu cầu xác nhận email; tài khoản mới chưa có profile/role sẽ không truy cập được dữ liệu nội bộ. Đăng xuất xóa phiên và dữ liệu tạm trên client.

Mã nguồn frontend chứa cấu hình project và publishable key công khai, không chứa khóa quản trị. Dùng project Supabase riêng khi tái sử dụng; sửa cấu hình trong school-data.js. Không dùng service-role key trong trình duyệt.

Migration nền nằm trong supabase/migrations; source handler nằm trong supabase/functions/school-tasks. Không chạy migration trên database hiện hữu mà chưa kiểm tra, sao lưu và duyệt tác động. Source được chia sẻ không chứng minh thay đổi đã deploy. Luồng ghi hiện có kiểm quyền tại server; kế hoạch chuyển kiểm soát ghi sang RLS chưa được áp dụng.

Chưa hoàn thiện báo cáo, xét duyệt, upload minh chứng hoặc quản trị tài khoản. Dữ liệu hiện có thuộc môi trường minh họa; không đưa dữ liệu học sinh thật vào thử nghiệm.

Bản công khai không chứa báo cáo nội bộ, backup, mapping tài khoản/import hoặc credentials. Không có tài khoản/mật khẩu dùng chung được phát hành cùng repository.
