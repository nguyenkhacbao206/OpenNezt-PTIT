# NMT Latency Benchmark Report

- **Model:** NLLB-200 distilled 600M (CTranslate2, `models/nllb-200-distilled-600M-ct2-int8`)
- **Device / compute:** `cpu` / `int8`
- **Beam size:** 4
- **Intra threads:** 0
- **Dataset:** 20 EN→VI + 20 VI→EN business-meeting sentences
- **Warmup (model load + 1st inference):** 4885.8 ms  _(excluded from stats below)_

## Summary (per-sentence latency, warmed model)

| Direction | N | Avg (ms) | P50 (ms) | P95 (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|---|---|
| EN → VI | 20 | 427.6 | 419.7 | 505.1 | 362.6 | 604.3 |
| VI → EN | 20 | 313.7 | 316.0 | 353.3 | 260.5 | 355.2 |
| **Overall** | 40 | **370.7** | 362.6 | 501.4 | 260.5 | 604.3 |

## Detail: EN → VI

| # | Latency (ms) | Source | Translation |
|---|---|---|---|
| 1 | 501.4 | Good morning, thank you all for joining today's meeting. | Chào buổi sáng, cám ơn mọi người đã tham gia cuộc họp hôm nay. |
| 2 | 372.8 | Could you please share the quarterly sales report? | Anh có thể chia sẻ báo cáo bán hàng quý không? |
| 3 | 366.4 | We need to finalize the budget before the end of this week. | Chúng ta cần phải hoàn thành ngân sách trước cuối tuần này. |
| 4 | 442.1 | The new product launch is scheduled for next month. | Việc ra mắt sản phẩm mới được lên kế hoạch cho tháng tới. |
| 5 | 604.3 | Let's schedule a follow-up call to discuss the details. | Chúng ta hãy sắp xếp cuộc gọi tiếp theo để thảo luận chi tiết. |
| 6 | 505.1 | Our team has completed the first phase of the project. | Nhóm của chúng tôi đã hoàn thành giai đoạn đầu tiên của dự án. |
| 7 | 449.5 | Please review the contract and send me your feedback. | Vui lòng xem lại hợp đồng và gửi cho tôi phản hồi của bạn. |
| 8 | 362.6 | The customer requested a discount on the bulk order. | Khách hàng yêu cầu giảm giá trên đơn đặt hàng hàng loạt. |
| 9 | 379.2 | I think we should hire two more engineers this quarter. | Tôi nghĩ chúng ta nên thuê thêm hai kỹ sư nữa trong quý này. |
| 10 | 379.5 | The server was down for about thirty minutes yesterday. | Máy chủ đã tắt trong khoảng ba mươi phút hôm qua. |
| 11 | 406.3 | Can you confirm the delivery date for the shipment? | Bạn có thể xác nhận ngày giao hàng cho lô hàng không? |
| 12 | 465.4 | We are expanding our operations into the Asian market. | Chúng tôi đang mở rộng hoạt động vào thị trường châu Á. |
| 13 | 433.2 | The marketing campaign increased our revenue by fifteen percent. | Chiến dịch tiếp thị đã làm tăng doanh thu của chúng tôi lên 15%. |
| 14 | 439.7 | Please make sure all invoices are paid on time. | Vui lòng đảm bảo tất cả các hóa đơn được thanh toán kịp thời. |
| 15 | 409.8 | The board approved the merger during the last meeting. | Hội đồng quản trị đã phê duyệt hợp nhất trong cuộc họp cuối cùng. |
| 16 | 473.7 | Our priority is to improve customer satisfaction this year. | ưu tiên của chúng tôi là cải thiện sự hài lòng của khách hàng trong năm nay. |
| 17 | 379.3 | I will send you the meeting notes after the call. | Tôi sẽ gửi cho anh những ghi chú cuộc họp sau cuộc gọi. |
| 18 | 419.7 | The prototype passed all the quality tests successfully. | Mô hình đã vượt qua tất cả các thử nghiệm chất lượng thành công. |
| 19 | 377.1 | We should invest more in research and development. | Chúng ta nên đầu tư nhiều hơn vào nghiên cứu và phát triển. |
| 20 | 385.7 | Thank you for your patience during the system upgrade. | Cảm ơn anh đã kiên nhẫn trong quá trình nâng cấp hệ thống. |

## Detail: VI → EN

| # | Latency (ms) | Source | Translation |
|---|---|---|---|
| 1 | 338.6 | Xin chào, cảm ơn mọi người đã tham gia cuộc họp hôm nay. | Hello, thank you all for attending today's meeting. |
| 2 | 261.9 | Bạn có thể chia sẻ báo cáo doanh số quý này không? | Can you share the quarterly sales report? |
| 3 | 341.0 | Chúng ta cần hoàn thiện ngân sách trước cuối tuần này. | We need to finish the budget by the end of the week. |
| 4 | 316.0 | Buổi ra mắt sản phẩm mới được lên lịch vào tháng sau. | The new product launch is scheduled for next month. |
| 5 | 351.9 | Hãy sắp xếp một cuộc gọi tiếp theo để bàn chi tiết. | Set up a next call to discuss the details. |
| 6 | 304.1 | Nhóm của chúng tôi đã hoàn thành giai đoạn đầu của dự án. | Our team has completed the first phase of the project. |
| 7 | 260.5 | Vui lòng xem lại hợp đồng và gửi phản hồi cho tôi. | Please review the contract and send me a response. |
| 8 | 355.2 | Khách hàng yêu cầu giảm giá cho đơn hàng số lượng lớn. | Customers are asking for a discount on large orders. |
| 9 | 342.6 | Tôi nghĩ chúng ta nên tuyển thêm hai kỹ sư trong quý này. | I think we should hire two more engineers this quarter. |
| 10 | 288.3 | Máy chủ bị ngừng hoạt động khoảng ba mươi phút hôm qua. | The server was down for about thirty minutes yesterday. |
| 11 | 307.7 | Bạn có thể xác nhận ngày giao hàng cho lô hàng không? | Can you confirm the delivery date for the shipment? |
| 12 | 321.5 | Chúng tôi đang mở rộng hoạt động sang thị trường châu Á. | We're expanding into the Asian market. |
| 13 | 332.4 | Chiến dịch tiếp thị đã tăng doanh thu của chúng tôi mười lăm phần trăm. | The marketing campaign increased our revenue by fifteen percent. |
| 14 | 307.4 | Vui lòng đảm bảo tất cả hóa đơn được thanh toán đúng hạn. | Please make sure all bills are paid on time. |
| 15 | 336.5 | Hội đồng đã phê duyệt việc sáp nhập trong cuộc họp trước. | The council approved the merger at its last meeting. |
| 16 | 305.8 | Ưu tiên của chúng tôi là cải thiện sự hài lòng của khách hàng năm nay. | Our priority is to improve customer satisfaction this year. |
| 17 | 353.3 | Tôi sẽ gửi cho bạn biên bản cuộc họp sau cuộc gọi. | I'll send you the minutes of the meeting after the call. |
| 18 | 274.6 | Bản mẫu đã vượt qua tất cả các bài kiểm tra chất lượng. | The sample passed all the quality tests. |
| 19 | 265.6 | Chúng ta nên đầu tư nhiều hơn vào nghiên cứu và phát triển. | We should invest more in research and development. |
| 20 | 309.4 | Cảm ơn sự kiên nhẫn của bạn trong quá trình nâng cấp hệ thống. | Thank you for your patience in the system upgrade process. |
