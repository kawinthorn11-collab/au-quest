# PLAN.md — AU Quest

## เครื่องมือที่พบในเครื่อง (12 พ.ย. 2569)
| เครื่องมือ | สถานะ | ใช้ทำอะไร |
|---|---|---|
| Node 24 / npm 11 | มี | Vite + React + TS |
| ffmpeg 9 | มี | แปลงเสียงไมค์เป็น wav, ทำเสียงช้า (atempo) |
| ego lite (`ego-browser`) | มี | ค้นเว็บ + ทดสอบแอป (ห้ามใช้ Playwright) |
| 9Router `localhost:20128/v1` | รันอยู่ 55 โมเดล | คู่สนทนาสัมภาษณ์ + ผลตอบกลับ + ตัวช่วยเรียบเรียงคำตอบ |
| ElevenLabs API | Starter, เหลือ ~25,600 ตัวอักษร | เสียงล่วงหน้า (ใช้ `eleven_v4_turbo` คิด 0.5 เครดิต/ตัวอักษร) |
| uv | มี | ติดตั้ง `mlx-whisper` (ถอดเสียงในเครื่อง) |
| Mimi local translation `127.0.0.1:18734` | อาจรันอยู่ | แปลซับ EN→TH ในเครื่อง (ถ้าไม่รันใช้ 9Router) |
| `say` (macOS) | มี | ไม่ใช้ (ใช้ Web Speech แทนเป็น fallback) |
| Homebrew, whisper.cpp, yt-dlp | ไม่มี | — |

## สถาปัตยกรรม
- `npm run dev` = Vite (`--host` ให้มือถือในวง Wi-Fi เปิดได้) + middleware `/api/*` ในตัว Vite (ไม่ต้องรันเซิร์ฟเวอร์แยก) — key ElevenLabs อยู่ฝั่ง Node เท่านั้น
- เนื้อหาทั้งหมดเป็น JSON ใน `content/` ถูก bundle เข้าแอป → ใช้ออฟไลน์ได้
- ความคืบหน้า + ไฟล์เสียงที่อัด เก็บใน IndexedDB, export/import เป็นไฟล์ .json
- เสียงพากย์: `public/audio/<hash>.mp3` + `manifest.json` (hash จาก voice|text) ถ้าไม่มีไฟล์ → Web Speech
- ถอดเสียง: mlx-whisper (ในเครื่อง) → ElevenLabs STT → Web Speech (สลับได้ใน Settings)
- AI: 9Router (เลือกโมเดลใน Settings) ถ้าไม่มี → ชุดคำถามต่อเนื่องเขียนไว้ล่วงหน้า + feedback แบบกฎ

## ลำดับงาน
1. โครงแอป: ภารกิจรายวัน, คลังโจทย์, SRS (1-3-7-16 วัน), mock + กระดาษคำตอบฝน, แผนย้อนจากวันสอบ
2. เนื้อหา: ด่าน L01–L08 (ช่วงปูพื้น) ครบ 7 ขั้น 25 ข้อ/ด่าน, cloze + บทอ่าน, mock 3 ชุด, คำถามสัมภาษณ์ 60 ข้อ → `npm run validate`
3. พูด: บันได 5 ขั้น, มาตรวัดความดัง, WPM/ช่วงเงียบ/คำเติม, ห้องสัมภาษณ์จำลอง
4. เสียง ElevenLabs ตามลำดับความสำคัญ, แอนิเมชัน SVG ต่อด่าน, คลิป YouTube ที่ตรวจแล้ว
5. ทดสอบใน ego lite ตาม checklist ข้อ 14
6. เติมเนื้อหาช่วง 2–4 (L09–L18, บทอ่าน/mock ที่เหลือ)
