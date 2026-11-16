// Phần thuần (không I/O) của seed-orders-demo: RNG, chọn ghế qua được luật ORPHAN_SEAT của hold_seats.
// Tách riêng để test được bằng `node --test` mà không cần DB.

/** RNG xác định (mulberry32) để chạy lại cùng --seed cho kết quả giống nhau. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BARRIER_TYPES = new Set(['AISLE', 'BROKEN']);
const PICKABLE_TYPES = new Set(['NORMAL', 'VIP']);

/** Chia ghế 1 hàng thành các đoạn liên tục; lối đi/ghế hỏng/ghế bị khoá là vách ngăn (khớp hold_seats §3.16). */
function splitRowIntoSegments(rowSeats, lockedIds) {
  const sorted = [...rowSeats].sort((a, b) => a.col - b.col);
  const segments = [];
  let current = [];
  let previous = null;
  for (const seat of sorted) {
    const isBarrier = BARRIER_TYPES.has(seat.type) || lockedIds.has(seat.id);
    if (isBarrier) {
      if (current.length > 0) segments.push(current);
      current = [];
      previous = seat;
      continue;
    }
    const hasGap = previous !== null && !BARRIER_TYPES.has(previous.type) && previous.col + previous.span !== seat.col;
    if (hasGap && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(seat);
    previous = seat;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/** Có ghế lẻ (1 ghế trống kẹp giữa ghế đã chiếm/biên đoạn) trong đoạn này không? Khớp điều kiện SQL ORPHAN_SEAT. */
function segmentHasOrphan(segment, occupiedAfter, occupiedBefore) {
  const availableBefore = segment.reduce((sum, seat) => sum + (occupiedBefore.has(seat.id) ? 0 : seat.span), 0);
  if (availableBefore <= 2) return false;
  return segment.some((seat, index) => {
    if (!PICKABLE_TYPES.has(seat.type) || occupiedAfter.has(seat.id)) return false;
    const previousBlocked = index === 0 || occupiedAfter.has(segment[index - 1].id);
    const nextBlocked = index === segment.length - 1 || occupiedAfter.has(segment[index + 1].id);
    return previousBlocked && nextBlocked;
  });
}

/**
 * Cách tách số ghế của 1 đơn thành các cụm liền kề, ưu tiên ít cụm. Phòng thật chia hàng bằng lối đi thành đoạn 4 ghế,
 * nên đơn 3 ghế (để lại 1 ghế lẻ) hay 5-6 ghế (dài hơn đoạn) chỉ xếp được khi tách cụm; hold_seats không đòi các ghế liền nhau.
 */
const PARTITIONS = {
  1: [[1]],
  2: [[2], [1, 1]],
  3: [[3], [2, 1], [1, 1, 1]],
  4: [[4], [3, 1], [2, 2], [2, 1, 1]],
  5: [[5], [4, 1], [3, 2], [2, 2, 1]],
  6: [[6], [4, 2], [3, 3], [4, 1, 1], [2, 2, 2]],
};

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Chọn đúng `count` ghế NORMAL/VIP chưa ai giữ, gom thành các cụm liền kề cùng đoạn, không tạo ghế lẻ trên mọi hàng bị đụng.
 * Trả về mảng id ghế hoặc null nếu phòng/suất không còn cách xếp hợp lệ.
 */
export function pickSeatWindow({ roomSeats, occupiedIds, lockedIds, count, random }) {
  const rows = new Map();
  for (const seat of roomSeats) {
    if (!rows.has(seat.row)) rows.set(seat.row, []);
    rows.get(seat.row).push(seat);
  }
  const segmentsByRow = new Map([...rows].map(([row, seats]) => [row, splitRowIntoSegments(seats, lockedIds)]));

  const windowsOfSize = (size) => {
    const windows = [];
    for (const [row, segments] of segmentsByRow) {
      for (const segment of segments) {
        for (let start = 0; start + size <= segment.length; start += 1) {
          windows.push({ row, window: segment.slice(start, start + size) });
        }
      }
    }
    return windows;
  };
  const rowHasOrphan = (row, occupiedAfter) =>
    segmentsByRow.get(row).some((segment) => segmentHasOrphan(segment, occupiedAfter, occupiedIds));

  const tryPartition = (parts) => {
    const occupiedAfter = new Set(occupiedIds);
    const picked = [];
    for (const size of parts) {
      let chosen = null;
      for (const candidate of shuffled(windowsOfSize(size), random)) {
        const free = candidate.window.every((seat) => PICKABLE_TYPES.has(seat.type) && !occupiedAfter.has(seat.id));
        if (!free) continue;
        const trial = new Set([...occupiedAfter, ...candidate.window.map((seat) => seat.id)]);
        if (rowHasOrphan(candidate.row, trial)) continue;
        chosen = { candidate, trial };
        break;
      }
      if (!chosen) return null;
      chosen.trial.forEach((id) => occupiedAfter.add(id));
      picked.push(...chosen.candidate.window.map((seat) => seat.id));
    }
    return picked;
  };

  for (const parts of PARTITIONS[count] ?? [[count]]) {
    const picked = tryPartition(parts);
    if (picked) return picked;
  }
  return null;
}

/** Số ghế NORMAL/VIP của phòng (mẫu số cho trần lấp đầy mỗi suất). */
export function pickableSeatCount(roomSeats) {
  return roomSeats.filter((seat) => PICKABLE_TYPES.has(seat.type)).length;
}

/** Số ghế/đơn: 1-6, nghiêng về 2-3 như thực tế. */
export function randomSeatCount(random) {
  const roll = random();
  if (roll < 0.12) return 1;
  if (roll < 0.52) return 2;
  if (roll < 0.74) return 3;
  if (roll < 0.88) return 4;
  return roll < 0.95 ? 5 : 6;
}

/**
 * Chọn suất + ghế cho 1 đơn: duyệt TOÀN BỘ suất còn dưới trần lấp đầy theo thứ tự ngẫu nhiên (không chỉ vài lần thử),
 * dừng ở suất đầu tiên có cửa sổ ghế hợp lệ. Trả { showtime, seatIds } hoặc { reason }.
 */
export function pickShowtimeAndSeats(showtimes, count, random, maxFillRatio) {
  const open = showtimes.filter((showtime) => showtime.occupied.size + count <= showtime.capacity * maxFillRatio);
  if (open.length === 0) return { reason: 'ALL_SHOWTIMES_AT_FILL_CAP' };
  for (let remaining = open.length; remaining > 0; remaining -= 1) {
    const pickIndex = Math.floor(random() * remaining);
    [open[pickIndex], open[remaining - 1]] = [open[remaining - 1], open[pickIndex]];
    const showtime = open[remaining - 1];
    const seatIds = pickSeatWindow({
      roomSeats: showtime.roomSeats,
      occupiedIds: new Set([...showtime.occupied, ...showtime.locked]),
      lockedIds: showtime.locked,
      count,
      random,
    });
    if (seatIds) return { showtime, seatIds };
  }
  return { reason: 'NO_VALID_SEAT_WINDOW' };
}

/**
 * Đếm lỗi LIÊN TIẾP (reset khi thành công) để dừng khi hệ thống hỏng thật, đồng thời gom thống kê mọi lỗi cho báo cáo cuối.
 * failure() trả true khi chuỗi lỗi liên tiếp đã vượt `limit`.
 */
export function createFailureTracker(limit) {
  let streak = 0;
  const tally = new Map();
  return {
    success() {
      streak = 0;
    },
    failure(reason) {
      streak += 1;
      tally.set(reason, (tally.get(reason) ?? 0) + 1);
      return streak > limit;
    },
    get streak() {
      return streak;
    },
    get tally() {
      return tally;
    },
    get total() {
      return [...tally.values()].reduce((sum, n) => sum + n, 0);
    },
  };
}
