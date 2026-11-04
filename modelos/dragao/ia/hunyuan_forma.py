import shutil
from gradio_client import Client, handle_file
f = lambda n: handle_file('dg/' + n)
def run(space, tag, **kw):
    try:
        c = Client(space, verbose=False)
        base = dict(caption=None, image=None, mv_image_front=None, mv_image_back=None, mv_image_left=None, mv_image_right=None,
                    steps=30, guidance_scale=5.0, seed=1234, octree_resolution=384, check_box_rembg=False, num_chunks=8000,
                    randomize_seed=False, api_name='/shape_generation')
        base.update(kw)
        r = c.predict(**base); p = r[0]; p = p.get('value', p) if isinstance(p, dict) else p
        shutil.copy(p, f'hy/dg_{tag}.glb'); print(tag, 'ok')
    except Exception as e:
        print(tag, 'erro', repr(e)[:250])
run('tencent/Hunyuan3D-2', 'single1', image=f('v1.png'), steps=50, guidance_scale=5.5)
run('tencent/Hunyuan3D-2mv', 'mvLR', mv_image_left=f('v4.png'), mv_image_right=f('v3.png'))
