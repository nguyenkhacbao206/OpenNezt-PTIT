# End-to-End Latency Benchmark Report

Full pipeline **audio → STT → NMT → TTS** on the offline stack, timed per turn.
Input audio is real Piper-synthesized speech resampled to 16 kHz mono WAV
(the exact format a client sends via `audio.chunk`).

## Configuration

- **STT:** Faster-Whisper `small` — `cpu`/`int8` (beam 5, VAD on)
- **NMT:** NLLB-200 distilled 600M (CT2) — `cpu`/`int8`, beam 4
- **TTS:** Piper (`models/tts`), length_scale 1.0
- **Dataset:** 20 EN→VI + 20 VI→EN business-meeting sentences
- **Warmup (all model loads + 1st turn):** 10817.0 ms  _(excluded from stats)_

## Summary — average latency per turn (warmed)

| Direction | N | STT avg | NMT avg | TTS avg | **E2E avg** | E2E P50 | E2E P95 | E2E max |
|---|---|---|---|---|---|---|---|---|
| EN → VI | 20 | 1905 | 453 | 161 | **2519** | 2507 | 2710 | 2749 |
| VI → EN | 20 | 2013 | 386 | 156 | **2556** | 2566 | 2683 | 2699 |
| **Overall** | 40 | 1959 | 420 | 159 | **2537** | 2522 | 2708 | 2749 |

_All figures in milliseconds. STT + NMT + TTS ≈ E2E (minor overhead excluded)._

## Detail: EN → VI

| # | E2E (ms) | STT (ms) | NMT (ms) | TTS (ms) | STT transcript | Translation |
|---|---|---|---|---|---|---|
| 1 | 2749 | 2029 | 527 | 193 | Good morning. Thank you all for joining today's meeting. | Chào buổi sáng, cám ơn mọi người đã tham gia cuộc họp hôm nay. |
| 2 | 2708 | 2077 | 478 | 153 | Could you please share the Corvalli sales report? | Anh có thể chia sẻ báo cáo bán hàng của Corvalli không? |
| 3 | 2377 | 1837 | 397 | 143 | We need to finalize the budget before the end of this week. | Chúng ta cần phải hoàn thành ngân sách trước cuối tuần này. |
| 4 | 2552 | 1976 | 417 | 158 | The new product launch is scheduled for next month. | Việc ra mắt sản phẩm mới được lên kế hoạch cho tháng tới. |
| 5 | 2587 | 1955 | 467 | 165 | Let's schedule a follow-up call to discuss the details. | Chúng ta hãy sắp xếp cuộc gọi tiếp theo để thảo luận chi tiết. |
| 6 | 2507 | 1855 | 486 | 166 | Our team has completed the first phase of the project. | Nhóm của chúng tôi đã hoàn thành giai đoạn đầu tiên của dự án. |
| 7 | 2710 | 2075 | 459 | 176 | Please review the contract and send me your feedback. | Vui lòng xem lại hợp đồng và gửi cho tôi phản hồi của bạn. |
| 8 | 2551 | 1991 | 414 | 147 | The customer requested a discount on the bulk order. | Khách hàng yêu cầu giảm giá trên đơn đặt hàng hàng loạt. |
| 9 | 2429 | 1854 | 424 | 151 | I think we should hire two more engineers this quarter. | Tôi nghĩ chúng ta nên thuê thêm hai kỹ sư nữa trong quý này. |
| 10 | 2507 | 1957 | 415 | 135 | The server was down for about 30 minutes yesterday. | Máy chủ đã tắt trong khoảng 30 phút hôm qua. |
| 11 | 2430 | 1887 | 413 | 129 | Can you confirm the delivery date for the shipment? | Bạn có thể xác nhận ngày giao hàng cho lô hàng không? |
| 12 | 2536 | 1916 | 477 | 143 | We are expanding our operations into the Asian market. | Chúng tôi đang mở rộng hoạt động vào thị trường châu Á. |
| 13 | 2457 | 1841 | 417 | 200 | The marketing campaign increased our revenue by 15%. | Chiến dịch tiếp thị đã làm tăng doanh thu của chúng tôi thêm 15%. |
| 14 | 2434 | 1788 | 466 | 179 | Please make sure all invoices are paid on time. | Vui lòng đảm bảo tất cả các hóa đơn được thanh toán kịp thời. |
| 15 | 2497 | 1827 | 493 | 177 | The Board approved the merger during the last meeting. | Hội đồng quản trị đã phê duyệt việc sáp nhập trong cuộc họp cuối cùng. |
| 16 | 2522 | 1822 | 514 | 186 | Our priority is to improve customer satisfaction this year. | ưu tiên của chúng tôi là cải thiện sự hài lòng của khách hàng trong năm nay. |
| 17 | 2469 | 1908 | 422 | 139 | I will send you the meeting notes after the call. | Tôi sẽ gửi cho anh những ghi chú cuộc họp sau cuộc gọi. |
| 18 | 2476 | 1793 | 507 | 176 | The prototype passed all the quality tests successfully. | Mô hình đã vượt qua tất cả các thử nghiệm chất lượng thành công. |
| 19 | 2424 | 1843 | 420 | 161 | We should invest more in research and development. | Chúng ta nên đầu tư nhiều hơn vào nghiên cứu và phát triển. |
| 20 | 2463 | 1865 | 447 | 151 | Thank you for your patience during the system upgrade. | Cảm ơn anh đã kiên nhẫn trong quá trình nâng cấp hệ thống. |

## Detail: VI → EN

| # | E2E (ms) | STT (ms) | NMT (ms) | TTS (ms) | STT transcript | Translation |
|---|---|---|---|---|---|---|
| 1 | 2374 | 1923 | 340 | 110 | Xin chào! Cảm ơn mọi người đã thang ra cuộc khó khô này! | Thank you so much for climbing this drought! |
| 2 | 2466 | 2019 | 310 | 138 | bạn có thể chia sẻ báo cáo xanh số quý ngày không? | Can you share the green quarterly report? |
| 3 | 2634 | 2087 | 407 | 140 | Chúng ta cần hoàn thiện ngân sách trước cuối tuần này." | We need to finish the budget by the end of the week". |
| 4 | 2668 | 1984 | 472 | 213 | Bội gia mắt sản phở mới được lây lịch vào tháng sau. | The next month is the calendar for the new fertility of the eye. |
| 5 | 2534 | 1978 | 404 | 153 | Hãy sắp xếp 1 cuộc gọi tiếp theo để bàn chi tiết. | Let's arrange a next call to discuss the details. |
| 6 | 2490 | 1973 | 350 | 166 | Nhóm của chúng tôi đã hoàn thành giai đoạn đầu của dự án. | Our team has completed the first phase of the project. |
| 7 | 2478 | 1957 | 364 | 157 | Vui lòng xem lại hợp đồng và gửi phản hồi cho tôi. | Please review the contract and send me a response. |
| 8 | 2666 | 2037 | 433 | 196 | Thách hàng yêu cầu giảm xá cho đơn hàng số lượng lớn. | The customer requested a discount for large quantities of orders. |
| 9 | 2583 | 1985 | 455 | 143 | Tôi nghĩ chúng ta nơi tuyển thêm 2 kỹ sư trong quý này." | I think we're hiring two more engineers this quarter". |
| 10 | 2380 | 1919 | 310 | 151 | máy chủ bị ngừng hoạt động khoảng 30 phút hôm qua. | The server was down for about 30 minutes yesterday. |
| 11 | 2581 | 2002 | 405 | 175 | bạn có thể sát nhật ngay sau hàng cho lo hàng không. | You can close the sun right after the air traffic control line. |
| 12 | 2474 | 2021 | 327 | 126 | Chúng tôi đã mở rộng hoạt động sang thị trường châu Á." | We've expanded into the Asian market". |
| 13 | 2498 | 1903 | 390 | 206 | Chín dịch tiếp thị đã tăng xanh thu của chúng tôi 15% | Nine marketing translations have increased our revenue by 15 percent. |
| 14 | 2683 | 2181 | 361 | 142 | vui lòng đảm bảo tất cả hóa đơn được thanh toán đúng hạt. | Please make sure all bills are paid correctly. |
| 15 | 2680 | 2088 | 434 | 158 | cuộc đồng đã phê duyệt việc xác nhập trong cuộc họp trước. | The council approved the body's admission at the previous meeting. |
| 16 | 2511 | 1939 | 373 | 199 | Tư tiên của chúng tôi là cải thiện sự hài lòng của khách hàng năm nay. | Our priority is to improve customer satisfaction this year. |
| 17 | 2603 | 1997 | 475 | 131 | tôi sẽ cử cho bạn bên bản cuộc khóc sau cuộc gọi. | I'll send you a note of mourning after the call. |
| 18 | 2566 | 2112 | 322 | 131 | bản mẫu đã phượt qua tất cả thác bài kiểm tra chất lượng. | The sample passed all the quality tests. |
| 19 | 2542 | 1988 | 420 | 134 | Chúng ta nây đầu từ nhiều hơn vào nghiên cứu và phát triển. | We're stepping further into research and development. |
| 20 | 2699 | 2169 | 372 | 158 | tạm ơn sự kiến dẫn của bạn trong quá trình nâng cấp hệ thống. | Thank you for your guidance in the system upgrade process. |
