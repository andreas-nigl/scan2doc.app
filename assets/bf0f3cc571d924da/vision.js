/* S2D image pipeline; consumes the embedded OpenCV.js build. */
(function (root) {
  'use strict';
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const area = pts => Math.abs(pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0) / 2);
  function order(points) {
    const center = points.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
    const sorted = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
    const first = sorted.reduce((best, p, i) => p.x + p.y < sorted[best].x + sorted[best].y ? i : best, 0);
    return sorted.slice(first).concat(sorted.slice(0, first));
  }
  function validQuad(points, width, height) {
    if (points.length !== 4 || area(points) < width * height * .04) return false;
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
      if (![a.x, a.y].every(Number.isFinite) || a.x < 0 || a.y < 0 || a.x >= width || a.y >= height || distance(a, b) < 16) return false;
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < 10 || (sign && Math.sign(cross) !== sign)) return false;
      sign = Math.sign(cross);
    }
    return true;
  }
  function fullQuad(width, height) {
    return [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }];
  }
  function detect(cv, rgba, maxEdge = 800) {
    const allocated = [];
    const keep = mat => { allocated.push(mat); return mat; };
    try {
      const scale = Math.min(1, maxEdge / Math.max(rgba.cols, rgba.rows));
      const small = keep(new cv.Mat()), gray = keep(new cv.Mat()), blur = keep(new cv.Mat());
      cv.resize(rgba, small, new cv.Size(Math.round(rgba.cols * scale), Math.round(rgba.rows * scale)), 0, 0, cv.INTER_AREA);
      cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      const masks = [], kernel = keep(cv.Mat.ones(3, 3, cv.CV_8U));
      for (const thresholds of [[35, 110], [12, 45]]) {
        const edges = keep(new cv.Mat());
        cv.Canny(blur, edges, thresholds[0], thresholds[1]);
        cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
        masks.push(edges);
      }
      const threshold = keep(new cv.Mat());
      cv.threshold(blur, threshold, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      masks.push(threshold);
      const candidates = [];
      for (const mask of masks) {
        const contours = new cv.MatVector(), hierarchy = new cv.Mat();
        try {
          cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
          for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            try {
              if (cv.contourArea(contour) < small.cols * small.rows * .13) continue;
              const perimeter = cv.arcLength(contour, true);
              for (const tolerance of [.012, .02, .035]) {
                const approx = new cv.Mat();
                try {
                  cv.approxPolyDP(contour, approx, tolerance * perimeter, true);
                  if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;
                  const pts = order(Array.from({ length: 4 }, (_, j) => ({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] })));
                  const fraction = area(pts) / (small.cols * small.rows);
                  if (fraction < .14 || fraction > .97 || !validQuad(pts, small.cols, small.rows)) continue;
                  // Reject the photo boundary, including threshold masks touching three edges.
                  const touches = pts.filter(p => p.x <= 2 || p.y <= 2 || p.x >= small.cols - 3 || p.y >= small.rows - 3).length;
                  if (touches >= 3) continue;
                  const sides = pts.map((p, j) => distance(p, pts[(j + 1) % 4]));
                  if (Math.max(...sides) / Math.min(...sides) > 8) continue;
                  const maxCos = Math.max(...pts.map((b, j) => {
                    const a = pts[(j + 3) % 4], c = pts[(j + 1) % 4];
                    return Math.abs(((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (distance(a, b) * distance(c, b)));
                  }));
                  if (maxCos > .82) continue;
                  const score = fraction * (1 - maxCos * .35) - touches * .04;
                  candidates.push({ points: pts.map(p => ({ x: p.x / scale, y: p.y / scale })), score, area: fraction });
                  break;
                } finally { approx.delete(); }
              }
            } finally { contour.delete(); }
          }
        } finally { contours.delete(); hierarchy.delete(); }
      }
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      return best ? { ...best, detected: true } : { points: fullQuad(rgba.cols, rgba.rows), detected: false, score: 0 };
    } finally { allocated.reverse().forEach(mat => mat.delete()); }
  }
  function warp(cv, rgba, points, inset = .005) {
    if (!validQuad(points, rgba.cols, rgba.rows)) throw new Error('Die vier Ecken müssen ein gültiges, nicht gekreuztes Viereck bilden.');
    const center = points.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
    const p = points.map(q => ({ x: q.x + (center.x - q.x) * inset * 2, y: q.y + (center.y - q.y) * inset * 2 }));
    const width = Math.max(2, Math.round(Math.max(distance(p[0], p[1]), distance(p[3], p[2]))));
    const height = Math.max(2, Math.round(Math.max(distance(p[0], p[3]), distance(p[1], p[2]))));
    const src = cv.matFromArray(4, 1, cv.CV_32FC2, p.flatMap(q => [q.x, q.y]));
    const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]);
    const transform = cv.getPerspectiveTransform(src, dst), result = new cv.Mat();
    try { cv.warpPerspective(rgba, result, transform, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE); return result; }
    catch (error) { result.delete(); throw error; }
    finally { src.delete(); dst.delete(); transform.delete(); }
  }
  function enhance(cv, rgba, mode = 'auto', strength = 1) {
    const result = rgba.clone();
    if (mode === 'original') return result;
    const small = new cv.Mat(), rgb = new cv.Mat(), background = new cv.Mat(), expanded = new cv.Mat();
    const scale = Math.min(1, 700 / Math.max(rgba.cols, rgba.rows));
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(31, 31));
    try {
      cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
      cv.resize(rgb, small, new cv.Size(Math.max(1, Math.round(rgb.cols * scale)), Math.max(1, Math.round(rgb.rows * scale))), 0, 0, cv.INTER_AREA);
      cv.morphologyEx(small, background, cv.MORPH_CLOSE, kernel);
      cv.GaussianBlur(background, background, new cv.Size(31, 31), 0);
      cv.resize(background, expanded, new cv.Size(rgba.cols, rgba.rows), 0, 0, cv.INTER_LINEAR);
      const input = rgba.data, output = result.data, bg = expanded.data;
      for (let i = 0, j = 0; i < input.length; i += 4, j += 3) {
        const chroma = Math.max(input[i], input[i + 1], input[i + 2]) - Math.min(input[i], input[i + 1], input[i + 2]);
        for (let k = 0; k < 3; k++) {
          const normalized = input[i + k] * 255 / Math.max(45, bg[j + k]);
          const corrected = chroma < 28 ? Math.max(0, Math.min(255, (normalized - 12) * 255 / 243)) : Math.min(255, normalized);
          output[i + k] = input[i + k] * (1 - strength) + corrected * strength;
        }
      }
      if (mode === 'gray' || mode === 'bw') {
        const gray = new cv.Mat();
        try {
          cv.cvtColor(result, gray, cv.COLOR_RGBA2GRAY);
          if (mode === 'bw') cv.adaptiveThreshold(gray, gray, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 41, 12);
          cv.cvtColor(gray, result, cv.COLOR_GRAY2RGBA);
        } finally { gray.delete(); }
      }
      return result;
    } catch (error) { result.delete(); throw error; }
    finally { small.delete(); rgb.delete(); background.delete(); expanded.delete(); kernel.delete(); }
  }
  root.S2DVision = { detect, warp, enhance, order, area, validQuad, fullQuad };
  if (typeof module !== 'undefined') module.exports = root.S2DVision;
})(typeof window !== 'undefined' ? window : globalThis);
