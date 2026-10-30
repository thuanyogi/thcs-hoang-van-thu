# Quản lý công việc trường học

Website minh họa quản lý công việc, dùng HTML/CSS/JavaScript, Supabase Auth, PostgreSQL RLS và Edge Function.

## Chạy local và build

Yêu cầu Node.js >=22.

```sh
npm start
```

Mở http://localhost:3000/. `index.html` là trang chính; `/code.html` cũ chuyển tới trang mới. Máy chủ chỉ phục vụ tài nguyên frontend trong allowlist.

```sh
npm run build
npm test
```

Build tạo `dist/` từ danh sách `scripts/public-assets.cjs`. Báo cáo, docs, SQL, server source, credentials và backup không được copy vào artifact website. Kiểm thử browser cần Playwright/Chrome hoặc trình duyệt kiểm tra thủ công.

## Triển khai Vercel

Import repository, Root Directory là thư mục gốc, Framework Preset **Other**. `vercel.json` quy định Build Command `npm run build` và Output Directory `dist`. URL `/` dùng `index.html`; `/code.html` chuyển về `/`. Sau deployment cần kiểm cả hai URL và asset JS/CSS. Không dùng `npm start` làm production server trên Vercel.

Vercel chỉ chứa frontend. Edge Function và DB Supabase được triển khai riêng, sau backup/phê duyệt schema/quyền. Supabase Auth cần Site URL/Redirect URLs gồm domain production và URL local được dùng. Giữ Confirm Email ON. Chỉ đổi file local chưa làm bản online đổi theo.

## Danh tính và quyền

Đăng nhập bằng tài khoản Supabase đã được xác nhận email. Đăng ký yêu cầu xác nhận email; tài khoản mới chưa có profile/role sẽ không truy cập được dữ liệu nội bộ. Đăng xuất xóa phiên và dữ liệu tạm trên client.

Mã nguồn frontend chứa cấu hình project và publishable key công khai, không chứa khóa quản trị. Dùng project Supabase riêng khi tái sử dụng; sửa cấu hình trong school-data.js. Không dùng service-role key trong trình duyệt.

Migration nền nằm trong supabase/migrations; source handler nằm trong supabase/functions/school-tasks. Không chạy migration trên database hiện hữu mà chưa kiểm tra, sao lưu và duyệt tác động. Source được chia sẻ không chứng minh thay đổi đã deploy. Luồng ghi hiện có kiểm quyền tại server; kế hoạch chuyển kiểm soát ghi sang RLS chưa được áp dụng.

Source có Dashboard tháng, quá hạn, tìm/lọc/phân trang; chi tiết công việc; bắt đầu thực hiện; báo cáo kèm minh chứng; duyệt/trả lại có lý do và hạn mới; lịch sử. Luồng mới cần gói SQL và Edge Function tương ứng; có source không đồng nghĩa đã triển khai trên Supabase. Không hiển thị thành công nếu request hoặc read-back thất bại.

Quy trình quản trị cấp/khóa tài khoản chưa được chốt, không cho người đăng ký tự chọn vai trò. Dữ liệu hiện có thuộc môi trường minh họa; không đưa dữ liệu học sinh thật vào thử nghiệm.

Bản công khai không chứa báo cáo nội bộ, backup, mapping tài khoản/import hoặc credentials. Không có tài khoản/mật khẩu dùng chung được phát hành cùng repository.
