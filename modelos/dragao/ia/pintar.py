# Pinta uma malha projetando várias fotos com ângulo desconhecido (estimado pela silhueta).
import sys, json, numpy as np, trimesh, fast_simplification
from PIL import Image
src, out, alvo, cfg = sys.argv[1], sys.argv[2], int(sys.argv[3]), json.loads(sys.argv[4])
m = trimesh.load(src, force='mesh'); m.merge_vertices()
m.update_faces(m.area_faces > 1e-12); m.remove_unreferenced_vertices()
def simp(m, n):
    v, f = fast_simplification.simplify(np.ascontiguousarray(m.vertices, np.float32), np.ascontiguousarray(m.faces, np.int32), max(0.0, 1 - n / len(m.faces)))
    return trimesh.Trimesh(v, f, process=True)
low = simp(m, 40000); m = simp(m, alvo); trimesh.repair.fix_normals(m)
print('malha', m.vertices.shape, m.faces.shape)
def rot(yaw, elev):
    a, e = np.radians(yaw), np.radians(elev)
    Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, np.cos(e), -np.sin(e)], [0, np.sin(e), np.cos(e)]])
    return Rx @ Ry
BARY = [(r, s, 1 - r - s) for r in np.linspace(0, 1, 5) for s in np.linspace(0, 1, 5) if r + s <= 1.0001]
def raster(V, F, px, py, W, H, d=None):
    zb = np.full((H, W), np.inf)
    for r, s, t in BARY:
        qx = (px[F[:, 0]] * r + px[F[:, 1]] * s + px[F[:, 2]] * t).astype(int).clip(0, W - 1)
        qy = (py[F[:, 0]] * r + py[F[:, 1]] * s + py[F[:, 2]] * t).astype(int).clip(0, H - 1)
        qd = np.zeros(len(F)) if d is None else d[F[:, 0]] * r + d[F[:, 1]] * s + d[F[:, 2]] * t
        np.minimum.at(zb, (qy, qx), qd)
    return zb
def fit(P, box):  # caixa da projeção -> caixa da silhueta
    x0, x1, y0, y1 = box
    sx = (x1 - x0) / (P[:, 0].max() - P[:, 0].min()); sy = (y1 - y0) / (P[:, 1].max() - P[:, 1].min())
    return x0 + (P[:, 0] - P[:, 0].min()) * sx, y1 - (P[:, 1] - P[:, 1].min()) * sy
imgs = {}
for name in cfg:
    a = np.asarray(Image.open(f'dg/{name}.png').convert('RGBA')).astype(np.float32) / 255
    ys, xs = np.where(a[..., 3] > 0.5); imgs[name] = (a, (xs.min(), xs.max(), ys.min(), ys.max()))
def iou(name, yaw, elev, S=4):
    a, box = imgs[name]; R = rot(yaw, elev); P = low.vertices @ R.T
    px, py = fit(P, box)
    W, H = a.shape[1] // S, a.shape[0] // S
    zb = raster(low.vertices, low.faces, px / S, py / S, W, H)
    from scipy import ndimage
    sil = ndimage.binary_closing(np.isfinite(zb), iterations=2)
    ref = a[::S, ::S, 3][:H, :W] > 0.5
    return (sil & ref).sum() / max((sil | ref).sum(), 1)
poses = {}
for name, (yr, er) in cfg.items():
    best = (-1, 0, 0)
    for yaw in np.arange(yr[0], yr[1] + 0.1, 10):
        for el in np.arange(er[0], er[1] + 0.1, 10):
            best = max(best, (iou(name, yaw, el, 8), yaw, el))
    _, y0, e0 = best
    for yaw in np.arange(y0 - 8, y0 + 8.1, 2):
        for el in np.arange(max(e0 - 8, -90), min(e0 + 8, 90) + 0.1, 2):
            best = max(best, (iou(name, yaw, el, 4), yaw, el))
    poses[name] = best; print(name, 'IoU %.3f yaw %.0f elev %.0f' % best)
V, N, F = m.vertices, m.vertex_normals, m.faces
acc = np.zeros((len(V), 3)); wsum = np.zeros(len(V))
for name, (q, yaw, el) in poses.items():
    a, box = imgs[name]; H, W = a.shape[:2]; R = rot(yaw, el)
    P = V @ R.T; px, py = fit(P, box); d = -P[:, 2]       # câmera em +z
    zb = raster(V, F, px, py, W, H, d)
    ix = px.round().astype(int).clip(0, W - 1); iy = py.round().astype(int).clip(0, H - 1)
    ext = np.ptp(V, 0).max()
    vis = d <= zb[iy, ix] + 0.01 * ext
    facing = np.clip((N @ R.T)[:, 2], 0, 1)
    fx = px.clip(0, W - 2); fy = py.clip(0, H - 2); x0 = fx.astype(int); y0 = fy.astype(int); ax = fx - x0; ay = fy - y0
    c = (a[y0, x0] * ((1 - ax) * (1 - ay))[:, None] + a[y0, x0 + 1] * (ax * (1 - ay))[:, None]
         + a[y0 + 1, x0] * ((1 - ax) * ay)[:, None] + a[y0 + 1, x0 + 1] * (ax * ay)[:, None])
    w = vis * facing ** 3 * (c[:, 3] > 0.85) * q ** 4
    acc += c[:, :3] * w[:, None]; wsum += w
    print(name, 'pintou', int((w > 0).sum()))
col = np.where(wsum[:, None] > 1e-4, acc / np.maximum(wsum, 1e-9)[:, None], np.nan)
nb = m.vertex_neighbors; print('sem cor', int(np.isnan(col[:, 0]).sum()))
for it in range(300):
    idx = np.where(np.isnan(col[:, 0]))[0]
    if not len(idx): break
    new = col.copy()
    for i in idx:
        cs = [col[j] for j in nb[i] if not np.isnan(col[j, 0])]
        if cs: new[i] = np.mean(cs, 0)
    col = new
col = np.nan_to_num(col, nan=0.5)
col = np.array([0.6 * col[i] + 0.4 * col[nb[i]].mean(0) if nb[i] else col[i] for i in range(len(col))])
m.visual = trimesh.visual.ColorVisuals(m, vertex_colors=np.c_[((col * 1.1).clip(0, 1) ** 2.2 * 255).astype(np.uint8), np.full(len(col), 255, np.uint8)])
m.export(out); print('ok', out)
