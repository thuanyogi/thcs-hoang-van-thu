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

Migration nền nằm trong supabase/migrations; source handler nằm trong supabase/functions/school-tasks. Không chạy migration trên database hiện hữu mà chưa kiểm tra, sao lưu và duyệt tác động. Source được chia sẻ không chứng minh thay đổi đã deploy. Đường ghi nghiệp vụ dùng RPC SECURITY DEFINER hẹp, lấy danh tính từ auth.uid() và kiểm profile/quyền/trạng thái trong PostgreSQL; client không được INSERT/UPDATE bảng trực tiếp. Đọc dữ liệu và tải tệp thực thi SELECT RLS.

Source có Dashboard tháng, quá hạn, tìm/lọc/phân trang; chi tiết công việc; bắt đầu thực hiện; báo cáo kèm minh chứng; duyệt/trả lại có lý do và hạn mới; lịch sử. Gói SQL và Edge Function đã triển khai ngày 30/10/2026 trên project hiện tại; khi tái sử dụng cần áp dụng các migration lên project riêng sau kiểm tra và backup. Không hiển thị thành công nếu request hoặc read-back thất bại.

Quy trình quản trị cấp/khóa tài khoản chưa được chốt, không cho người đăng ký tự chọn vai trò. Dữ liệu hiện có thuộc môi trường minh họa; không đưa dữ liệu học sinh thật vào thử nghiệm.

Bản công khai không chứa báo cáo nội bộ, backup, mapping tài khoản/import hoặc credentials. Không có tài khoản/mật khẩu dùng chung được phát hành cùng repository.

## Trạng thái bản triển khai 30/10/2026

URL production: https://thcs-hoang-van-thu.vercel.app/. Đã xác minh URL gốc 200, URL cũ chuyển tiếp, Login/F5/Logout trên trình duyệt online. Kiểm thử API/DB/Storage thật đạt luồng báo cáo–trả lại–nộp lại–duyệt và quyền âm tính, giữ nguyên dữ liệu gốc. Không coi đây là nghiệm thu vận hành của nhà trường. Email xác nhận gửi tới hộp thư thật, thời gian hết hạn phiên tự nhiên và chính sách lưu/xóa tệp còn cần xác nhận.

Migration bổ sung `return_business_conflicts_without_retry` dùng PT409 thay mã40001 cho xung đột nghiệp vụ để tránh PostgREST tự retry; không đổi quyền hoặc cấu trúc dữ liệu.


## Thông báo Telegram khi có task mới

Supabase `school-tasks` gọi `telegram-notify` sau khi RPC tạo task đã commit. Chỉ gửi mã task và link trang chính có yêu cầu đăng nhập vào chat quản lý cố định. Cấu hình `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` trong Supabase Edge Functions Secrets; không đưa giá trị vào frontend hoặc log. Mọi thành viên chat cần có quyền xem toàn bộ công việc được thông báo.

Migration `20261030152000_add_telegram_task_notifications.sql` tạo trạng thái gửi cùng task; bảng RLS chỉ backend truy cập và RPC claim chỉ service_role gọi. `telegram-notify` kiểm email xác nhận, vai trò người giao và quyền task trước claim. Task cũ trước migration không được gửi. Endpoint test riêng chỉ BGH gọi.

Gửi thành công, thất bại và chưa xác định được hiển thị riêng với kết quả lưu DB. Không rollback task khi Telegram lỗi. Claim được lưu trước khi gửi; không tự retry trạng thái đã claim. Crash hoặc mất mạng có thể để trạng thái pending/sending/unknown; đây là best-effort, chưa có worker đảm bảo giao tin hay xác nhận đã đọc. Không tạo lại task để thử gửi lại.

Kiểm thử helper: `node --test tests/telegram-notify.test.cjs`. Kiểm thử thật `scripts/verify-telegram-live.cjs` chỉ chạy sau backup và phê duyệt dữ liệu thử; cần fixture riêng không công khai. Test này gửi Telegram thật và giữ một task tổng hợp. Triển khai hai function bằng Supabase CLI theo project đã kiểm tra; cập nhật frontend qua pipeline Vercel/GitHub hiện có. Rollback bằng cách triển khai lại school-tasks phiên bản trước, giữ trạng thái gửi để đối chiếu; không xóa task.
