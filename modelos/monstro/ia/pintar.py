# Pinta a forma do Hunyuan3D projetando as 4 vistas de referência (cores por vértice).
import sys, numpy as np, trimesh, fast_simplification
from PIL import Image
src, out, alvo = sys.argv[1], sys.argv[2], int(sys.argv[3])
m = trimesh.load(src, force='mesh')
m.merge_vertices()
m.update_faces(m.area_faces > 1e-12); m.remove_unreferenced_vertices()
print('original limpo', m.vertices.shape, m.faces.shape)
v, f = fast_simplification.simplify(np.ascontiguousarray(m.vertices, dtype=np.float32), np.ascontiguousarray(m.faces, dtype=np.int32), max(0.0, 1 - alvo / len(m.faces)))
m = trimesh.Trimesh(v, f, process=True)
trimesh.repair.fix_normals(m)
V, N = m.vertices, m.vertex_normals
print('malha', V.shape, m.faces.shape)

def carrega(n):
    a = np.asarray(Image.open(f'rec/{n}.png').convert('RGBA')).astype(np.float32) / 255
    ys, xs = np.where(a[..., 3] > 0.5)
    return a, (xs.min(), xs.max(), ys.min(), ys.max())
# cada vista: (imagem, eixo horizontal da imagem (vetor 3D), direção da câmera para o objeto)
views = [('1_frente', np.array([1, 0, 0]), np.array([0, 0, -1])),
         ('3_tras', np.array([-1, 0, 0]), np.array([0, 0, 1])),
         ('2_lado_esquerdo', np.array([0, 0, 1]), np.array([1, 0, 0])),
         ('4_lado_direito', np.array([0, 0, -1]), np.array([-1, 0, 0]))]
acc = np.zeros((len(V), 3)); wsum = np.zeros(len(V))
for name, right, fwd in views:
    img, (x0, x1, y0, y1) = carrega(name)
    H, W = img.shape[:2]
    u = V @ right; h = V[:, 1]; d = V @ fwd           # d: profundidade (menor = mais perto)
    # encaixa a caixa da malha na caixa do recorte
    su = (x1 - x0) / (u.max() - u.min()); sv = (y1 - y0) / (h.max() - h.min())
    px = x0 + (u - u.min()) * su; py = y1 - (h - h.min()) * sv
    # z-buffer rasterizando os triângulos de forma aproximada (pontos densos)
    zb = np.full((H, W), np.inf)
    F = m.faces
    for t in np.linspace(0, 1, 5):
        for s in np.linspace(0, 1 - t, max(1, int(5 * (1 - t)))):
            r = 1 - t - s
            qx = (px[F[:, 0]] * r + px[F[:, 1]] * s + px[F[:, 2]] * t).astype(int).clip(0, W - 1)
            qy = (py[F[:, 0]] * r + py[F[:, 1]] * s + py[F[:, 2]] * t).astype(int).clip(0, H - 1)
            qd = d[F[:, 0]] * r + d[F[:, 1]] * s + d[F[:, 2]] * t
            np.minimum.at(zb, (qy, qx), qd)
    ix = px.round().astype(int).clip(0, W - 1); iy = py.round().astype(int).clip(0, H - 1)
    vis = d <= zb[iy, ix] + 0.012
    facing = np.clip(-(N @ fwd), 0, 1)
    w = vis * facing ** 3
    # amostra bilinear
    fx = px.clip(0, W - 2); fy = py.clip(0, H - 2); ix0 = fx.astype(int); iy0 = fy.astype(int); ax = fx - ix0; ay = fy - iy0
    c = (img[iy0, ix0] * ((1 - ax) * (1 - ay))[:, None] + img[iy0, ix0 + 1] * (ax * (1 - ay))[:, None]
         + img[iy0 + 1, ix0] * ((1 - ax) * ay)[:, None] + img[iy0 + 1, ix0 + 1] * (ax * ay)[:, None])
    w = w * (c[:, 3] > 0.9)
    acc += c[:, :3] * w[:, None]; wsum += w
    print(name, 'visíveis', int((w > 0).sum()))
col = np.where(wsum[:, None] > 1e-3, acc / np.maximum(wsum, 1e-6)[:, None], np.nan)
# preenche o que nenhuma câmera viu, espalhando pelos vizinhos
nb = m.vertex_neighbors
falt = np.isnan(col[:, 0]); print('sem cor', int(falt.sum()))
for it in range(200):
    idx = np.where(np.isnan(col[:, 0]))[0]
    if not len(idx): break
    for i in idx:
        cs = [col[j] for j in nb[i] if not np.isnan(col[j, 0])]
        if cs: col[i] = np.mean(cs, 0)
col = np.nan_to_num(col, nan=0.5)
# leve suavização para esconder emendas
for it in range(2):
    col = np.array([0.5 * col[i] + 0.5 * col[nb[i]].mean(0) if nb[i] else col[i] for i in range(len(col))])
m.visual = trimesh.visual.ColorVisuals(m, vertex_colors=np.c_[((col * 1.12).clip(0, 1) ** 2.2 * 255).astype(np.uint8), np.full(len(col), 255, np.uint8)])
m.export(out)
print('ok', out)
