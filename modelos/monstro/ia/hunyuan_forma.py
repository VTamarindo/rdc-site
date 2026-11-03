import sys, shutil, json
from gradio_client import Client, handle_file
c = Client('tencent/Hunyuan3D-2mv', verbose=False)
R = 'rec/'; f = lambda n: handle_file(R + n)
for tag, L, Rt in [('A', '2_lado_esquerdo.png', '4_lado_direito.png'), ('B', '4_lado_direito.png', '2_lado_esquerdo.png')]:
    try:
        r = c.predict(caption=None, image=None, mv_image_front=f('1_frente.png'), mv_image_back=f('3_tras.png'),
                      mv_image_left=f(L), mv_image_right=f(Rt), steps=30, guidance_scale=5.0, seed=1234,
                      octree_resolution=384, check_box_rembg=False, num_chunks=8000, randomize_seed=False,
                      api_name='/shape_generation')
        p = r[0]; p = p.get('value', p) if isinstance(p, dict) else p
        shutil.copy(p, f'hy/mv_{tag}.glb'); print(tag, 'ok')
    except Exception as e:
        print(tag, 'erro', repr(e)[:300])
