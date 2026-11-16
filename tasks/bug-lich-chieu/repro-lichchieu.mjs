import { createRequire } from 'node:module';
const require = createRequire('E:/FilmBooking/package.json');
const { chromium } = require('@playwright/test');
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:3000/lich-chieu', { waitUntil: 'networkidle' });
const heads = async () => (await p.locator('main h2').allInnerTexts()).join(' | ');
console.log('URL ban dau:', p.url());
console.log('Phim hien thi (h2):', await heads());
// 1. đổi bộ lọc phim
await p.selectOption('#filter-movie', { index: 2 });
await p.waitForTimeout(1500);
console.log('Sau chon phim #2 -> URL:', p.url(), '| h2:', await heads());
// 2. đổi rạp
await p.selectOption('#filter-cinema', { index: 2 });
await p.waitForTimeout(1500);
console.log('Sau chon rap #2 -> URL:', p.url(), '| h2:', await heads());
// 3. đổi tỉnh
await p.selectOption('#filter-province', { index: 1 });
await p.waitForTimeout(1500);
console.log('Sau chon tinh #1 -> URL:', p.url());
// 4. bấm ngày khác
await p.goto('http://localhost:3000/lich-chieu', { waitUntil: 'networkidle' });
const days = p.locator('button[aria-pressed]');
console.log('So nut ngay:', await days.count(), '| dang chon:', await p.locator('button[aria-pressed=true]').innerText());
await days.nth(3).click();
await p.waitForTimeout(1000);
console.log('Sau bam ngay #4 -> URL:', p.url(), '| dang chon:', await p.locator('button[aria-pressed=true]').innerText());
await b.close();
