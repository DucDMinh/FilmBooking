import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pickSeatWindow } from './seed-orders-demo-lib.mjs';

// Hàng A: 8 ghế NORMAL liền nhau (col 1..8), hàng B: lối đi giữa chia 2 đoạn.
const roomSeats = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `A${i + 1}`, row: 'A', col: i + 1, span: 1, type: 'NORMAL' })),
  ...[1, 2, 3].map((col) => ({ id: `B${col}`, row: 'B', col, span: 1, type: 'NORMAL' })),
  { id: 'B4', row: 'B', col: 4, span: 1, type: 'AISLE' },
  ...[5, 6, 7].map((col) => ({ id: `B${col}`, row: 'B', col, span: 1, type: 'VIP' })),
];

test('mulberry32 xác định theo seed', () => {
  assert.equal(mulberry32(7)(), mulberry32(7)());
});

test('chọn k ghế liền kề, không trùng ghế đã chiếm, không tạo ghế lẻ', () => {
  const occupiedIds = new Set(['A1', 'A2']);
  for (let seed = 1; seed <= 50; seed += 1) {
    const ids = pickSeatWindow({ roomSeats, occupiedIds, lockedIds: new Set(), count: 3, random: mulberry32(seed) });
    assert.ok(ids, 'phải còn cửa sổ hợp lệ');
    assert.equal(ids.length, 3);
    assert.ok(ids.every((id) => !occupiedIds.has(id)));
    const after = new Set([...occupiedIds, ...ids]);
    if (ids[0].startsWith('A')) {
      // hàng A (8 ghế, đã chiếm A1-A2): không được để đúng 1 ghế trống bị kẹp
      const free = Array.from({ length: 8 }, (_, i) => `A${i + 1}`).filter((id) => !after.has(id));
      const isolated = free.filter((id, i) => !free.includes(`A${Number(id.slice(1)) - 1}`) && !free.includes(`A${Number(id.slice(1)) + 1}`) && i >= 0);
      assert.equal(isolated.length, 0, `ghế lẻ ở ${isolated} khi chọn ${ids}`);
    }
  }
});

test('cụm liền kề không vắt qua lối đi', () => {
  const ids = pickSeatWindow({ roomSeats, occupiedIds: new Set(), lockedIds: new Set(), count: 7, random: mulberry32(3) });
  assert.equal(ids, null, 'hàng A 8 ghế: 7 ghế liền sẽ để 1 ghế lẻ, không có cách tách nào cho 7 -> null');
});

import { createFailureTracker, pickShowtimeAndSeats, randomSeatCount } from './seed-orders-demo-lib.mjs';

// Phòng thật: mỗi hàng chia bằng lối đi thành 2 đoạn 4 ghế (như seed demo).
const realRoom = ['A', 'B', 'C', 'D'].flatMap((row) => [
  ...[1, 2, 3, 4].map((col) => ({ id: `${row}${col}`, row, col, span: 1, type: 'NORMAL' })),
  { id: `${row}5`, row, col: 5, span: 1, type: 'AISLE' },
  { id: `${row}6`, row, col: 6, span: 1, type: 'AISLE' },
  ...[7, 8, 9, 10].map((col) => ({ id: `${row}${col}`, row, col, span: 1, type: 'NORMAL' })),
]);

test('phòng đoạn 4 ghế: mọi số ghế 1-6 đều xếp được (tách cụm khi cần), đủ số ghế, không trùng', () => {
  for (let count = 1; count <= 6; count += 1) {
    for (let seed = 1; seed <= 30; seed += 1) {
      const ids = pickSeatWindow({ roomSeats: realRoom, occupiedIds: new Set(), lockedIds: new Set(), count, random: mulberry32(seed) });
      assert.ok(ids, `count=${count} seed=${seed} phải xếp được`);
      assert.equal(ids.length, count);
      assert.equal(new Set(ids).size, count);
    }
  }
});

test('3 ghế trong đoạn 4 ghế không để lại 1 ghế lẻ trong cùng đoạn', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const ids = pickSeatWindow({ roomSeats: realRoom, occupiedIds: new Set(), lockedIds: new Set(), count: 3, random: mulberry32(seed) });
    const taken = new Set(ids);
    for (const row of ['A', 'B', 'C', 'D']) {
      for (const segment of [[1, 2, 3, 4], [7, 8, 9, 10]]) {
        const used = segment.filter((col) => taken.has(`${row}${col}`)).length;
        assert.notEqual(used, 3, `đoạn ${row} ${segment} chỉ được dùng 3/4 ghế (còn 1 ghế lẻ)`);
      }
    }
  }
});

test('pickShowtimeAndSeats duyệt mọi suất: suất đầu hết chỗ vẫn tìm được suất sau, và báo lý do khi hết sạch', () => {
  const full = { id: 's1', roomSeats: realRoom, capacity: 32, occupied: new Set(realRoom.map((seat) => seat.id)), locked: new Set() };
  const empty = { id: 's2', roomSeats: realRoom, capacity: 32, occupied: new Set(), locked: new Set() };
  const picked = pickShowtimeAndSeats([full, empty], 2, mulberry32(1), 1);
  assert.equal(picked.showtime.id, 's2');
  assert.equal(pickShowtimeAndSeats([full], 2, mulberry32(1), 1).reason, 'ALL_SHOWTIMES_AT_FILL_CAP');
  const blocked = { ...empty, id: 's3', occupied: new Set(['A1']) };
  assert.equal(pickShowtimeAndSeats([blocked], 31, mulberry32(1), 1).reason, 'NO_VALID_SEAT_WINDOW');
});

test('randomSeatCount luôn trong 1..6', () => {
  const random = mulberry32(9);
  for (let i = 0; i < 500; i += 1) {
    const n = randomSeatCount(random);
    assert.ok(n >= 1 && n <= 6);
  }
});

test('createFailureTracker đếm lỗi LIÊN TIẾP, reset khi thành công, vẫn gom thống kê tổng', () => {
  const tracker = createFailureTracker(3);
  assert.equal(tracker.failure('A'), false);
  assert.equal(tracker.failure('A'), false);
  assert.equal(tracker.failure('B'), false);
  tracker.success();
  for (let i = 0; i < 3; i += 1) assert.equal(tracker.failure('A'), false);
  assert.equal(tracker.failure('A'), true, 'lỗi liên tiếp thứ 4 vượt ngưỡng 3');
  assert.equal(tracker.total, 7);
  assert.equal(tracker.tally.get('A'), 6);
});
