# Bot cảnh báo kỹ thuật VN100

Bot theo dõi rổ VN100 và gửi cảnh báo vào hai group Telegram tách biệt.
**Chỉ cảnh báo — không đặt lệnh, không khuyến nghị mua bán.**

| Kênh | Nội dung |
|---|---|
| `RSI Alerts` | RSI(14) đa khung cho toàn bộ VN100 |
| `Bank Technical Alerts` | Bollinger tháng + MA50 ngày cho 18 mã ngân hàng |

## Logic tín hiệu

**Luồng 1 — RSI (toàn VN100)**

1. RSI 4H vừa xuống dưới 30 → cảnh báo "quá bán".
2. Sau cảnh báo trên, RSI 1H cắt lên trên 30 → cảnh báo "hồi ngắn hạn".
3. RSI ngày luôn đính kèm làm bối cảnh, không chặn tín hiệu.
4. Chống lặp: mã đã bắn cảnh báo phải để RSI 4H hồi lên ≥ 30 mới được bắn lần nữa.

**Luồng 2 — Ngân hàng**

- BB(20,2) nến **tháng**: cảnh báo khi giá chạm dải trên/dưới, tối đa 1 lần/dải/tháng, ghi rõ "nến tháng chưa đóng".
- MA50 nến **ngày**: chỉ xét giá đóng cửa cắt lên/xuống, râu nến không tính.

## Chạy nhanh

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # NOTIFIER=console để test trước
python run.py scan-bank       # quét thử nhóm ngân hàng (~1 phút)
```

Lệnh có sẵn: `scan-rsi`, `scan-bank`, `scan-all`, `serve`, `test-telegram`.

## Những điểm đã kiểm chứng thực tế

**Rate limit là ràng buộc lớn nhất.** vnstock gói Guest chỉ cho **20 request/phút**,
và khi chạm trần nó gọi `sys.exit()` — giết luôn tiến trình chứ không throw
exception thường. Bot xử lý bằng ba lớp:

1. `RateLimiter` giới hạn chủ động (mặc định 18/phút, dưới trần).
2. Cache theo độ tươi: nến ngày/tháng chỉ làm mới 1 lần/12 giờ, chỉ nến 1H
   refresh mỗi lượt quét → một lượt quét intraday tốn ~100 request thay vì 300.
3. Bắt `SystemExit` trong `fetch_history` để bot không chết giữa phiên.

### API key — bắt buộc nếu muốn nâng tốc độ

`MAX_RPM` chỉ là bộ hãm **phía bot**, nó không nâng quota. Muốn thật sự lên
60 req/phút thì phải có API key, đăng ký miễn phí tại
https://vnstocks.com/login rồi điền vào `.env`:

```
VNSTOCK_API_KEY=<key của bạn>
MAX_RPM=55
```

vnstock đọc thẳng biến `VNSTOCK_API_KEY` từ môi trường, không cần gọi hàm
đăng ký nào trong code. Cách khác là lưu vĩnh viễn vào `~/.vnstock/api_key.json`:

```python
import vnai; vnai.setup_api_key("<key>")
```

Biến môi trường được ưu tiên hơn file, và hợp với Docker hơn nên bot dùng cách này.

**Đặt `MAX_RPM=55` mà không có key là tệ hơn không sửa gì** — bot sẽ bắn 55
request/phút vào trần 20 và bị vnstock giết tiến trình. Bot tự kiểm tra và
cảnh báo ngay lúc khởi động nếu hai giá trị này lệch nhau.

**Range dữ liệu càng dài càng tốn nhiều request** (vnstock chia nhỏ nội bộ).
Vì vậy `LOOKBACK_DAYS` để ở mức tối thiểu đủ dùng: 45 ngày cho 1H, 150 ngày
cho 1D, 3 năm cho 1M.

**RSI phải seed bằng SMA.** Dùng thẳng `ewm(alpha=1/14, adjust=False)` cho kết
quả lệch tới **11.9 điểm RSI** so với TradingView. Hàm `rma()` trong
`indicators.py` seed bằng SMA rồi mới làm mượt đệ quy, đã đối chiếu khớp
tuyệt đối (sai lệch 0.0) với bản tham chiếu tính thủ công.

**Nến 4H được resample từ nến 1H** theo phiên giao dịch VN: mỗi ngày ra 2 nến
— phiên sáng (gom 09,10,11 giờ) và phiên chiều (gom 13,14 giờ). Sàn HOSE
không chia hết cho 4 giờ nên không có định nghĩa 4H "chuẩn"; nếu muốn khớp
TradingView chính xác, sửa mỗi hàm `resample_4h()` trong `data.py`.

**Gộp tin nhắn là bắt buộc, không phải tối ưu.** Telegram giới hạn 20 tin/phút
mỗi group. Phiên bán tháo có thể có 40–60 mã cùng thủng RSI 30 — gửi 1 tin/mã
sẽ vừa bị chặn vừa không ai đọc nổi. `_format_digest()` gộp tất cả thành một
tin, tự chia nhỏ khi vượt 4000 ký tự.

## Hạn chế đã biết

- **Chưa loại trừ ngày lễ.** `is_trading_day()` chỉ lọc thứ 7 và Chủ nhật.
  Vào ngày lễ bot vẫn chạy nhưng dữ liệu không đổi nên không sinh tín hiệu sai
  — chỉ tốn request. Muốn chuẩn thì bổ sung danh sách nghỉ lễ HOSE hàng năm.
- **Lần chạy đầu của MA50 không bắn cảnh báo**, chỉ ghi nhận vị thế hiện tại
  (trên/dưới MA50). Đây là chủ ý — nếu không sẽ bắn hàng loạt cảnh báo lịch sử.
- **`vnstock` tự ghi file `AGENTS.md`** vào thư mục làm việc, chứa chỉ thị
  nhắm vào AI coding assistant. File này đã được cho vào `.gitignore`.
- **Giấy phép vnstock là custom, dành cho cá nhân/phi thương mại.** Dùng cho
  mục đích thương mại cần xin phép tác giả.

## Dùng Slack thay vì Telegram

Đã hỗ trợ sẵn. Sửa `.env`:

```
NOTIFIER=slack
SLACK_RSI_WEBHOOK=https://hooks.slack.com/services/...
SLACK_BANK_WEBHOOK=https://hooks.slack.com/services/...
```

Tạo webhook: <https://api.slack.com/apps> → Create New App → From scratch →
Incoming Webhooks → bật lên → Add New Webhook to Workspace, làm **hai lần**
cho hai channel khác nhau.

Logic chỉ báo không đổi một dòng nào — chúng chỉ sinh ra đối tượng `Alert`,
còn `SlackNotifier` lo phần trình bày bằng Block Kit.

### Khác biệt kỹ thuật so với Telegram

| | Telegram | Slack |
|---|---|---|
| Trần gửi | 20 tin/phút/group | ~1 tin/giây/channel |
| Giới hạn 1 tin | 4096 ký tự | 50 block |
| Bot chia nhỏ theo | độ dài ký tự | số block (48 + header + divider) |
| Xác thực | 1 bot token + 2 chat_id | 2 webhook URL |

Đã kiểm chứng: 120 cảnh báo → 3 tin nhắn (50/50/26 block), không mất cảnh báo nào.

### Lưu ý về giới hạn 90 ngày của Slack Free

Ít nghiêm trọng hơn tưởng, vì **bot tự lưu mọi cảnh báo vào bảng `alert_log`
trong SQLite**, độc lập với nền tảng chat. Slack ẩn tin cũ nhưng bạn vẫn truy
vấn lại được đầy đủ:

```sql
SELECT ts, symbol, kind FROM alert_log WHERE ts > '2026-01-01' ORDER BY ts;
```

Cái Slack Free thật sự lấy mất là khả năng *cuộn lên đọc lại trong app*, không
phải bản thân dữ liệu.

### Điều bot chưa làm được với Slack

Nối tín hiệu hồi 1H thành **thread reply** dưới cảnh báo quá bán 4H — đây là ưu
thế thật sự của Slack. Incoming webhook không làm được, cần bot token (`xoxb-`)
và `chat.postMessage` để lấy `thread_ts`, rồi lưu `ts` đó theo từng mã. Chưa
implement; nếu cần thì đây là việc đáng làm nhất khi chuyển sang Slack.

## Miễn trừ

RSI, Bollinger Bands và MA50 chỉ là chỉ báo kỹ thuật. Cảnh báo là tín hiệu để
theo dõi thêm, không phải khuyến nghị đầu tư.

## Chạy trên máy Mac thay vì máy chủ

Nếu máy Mac của bạn luôn bật và cắm điện, chạy tại chỗ đơn giản hơn nhiều so
với dựng VM. Cắm điện thôi thì chưa đủ — cần xử lý ba thứ:

```bash
bash macos/setup-macos.sh
```

Script này lo cả ba:

1. **Ngăn máy ngủ.** macOS vẫn tự ngủ dù đang cắm điện. `pmset -c sleep 0`
   tắt hành vi đó, và `caffeinate -i` trong LaunchAgent giữ máy thức chừng nào
   bot còn chạy.
2. **Tự khởi động lại.** `KeepAlive` bật lại bot nếu nó chết;
   `pmset -a autorestart 1` bật lại máy sau khi mất điện; `RunAtLoad` chạy bot
   ngay khi bạn đăng nhập.
3. **Đúng múi giờ** cho tiến trình nền, vì lịch quét dựa trên phiên HOSE.

Kiểm tra và gỡ:

```bash
launchctl print gui/$(id -u)/com.vn100bot | head -20
tail -f data/bot.log
launchctl bootout gui/$(id -u)/com.vn100bot     # gỡ
```

### Điều script KHÔNG lo được

- **Đóng nắp MacBook là ngủ**, trừ khi có màn hình ngoài cắm vào. Máy bàn
  (Mac mini / Studio) không dính vấn đề này.
- **macOS update tự reboot.** Bot sẽ chạy lại khi bạn đăng nhập, nhưng nếu máy
  dừng ở màn hình đăng nhập thì LaunchAgent chưa chạy. Tắt tự động cài update
  ngoài giờ nếu muốn chắc chắn.
- **Mất mạng / mất điện tại nhà** trong phiên giao dịch.

Với bot cảnh báo cá nhân, ba rủi ro trên thường chấp nhận được — mất vài tín
hiệu không nghiêm trọng. Nếu không chấp nhận được thì mới cần lên Oracle Cloud.
