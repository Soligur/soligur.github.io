# soligur.github.io

A browser-based 3D voxel sandbox inspired by Minecraft.

## Run locally

Use any static server from the project root, for example:

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Controls

- Click to lock cursor
- `S` move forward, `W` move backward, `A/D` strafe
- `Space` jump
- Hold left click to mine blocks over time (dirt fastest, then wood, then stone)
- Right click places your currently selected inventory block
- Press `1-4` to select block type in your hotbar

## Gameplay notes

- Different block types are collected into inventory when mined (`grass`, `dirt`, `wood`, `stone`).
- Terrain now keeps stone directly under the green grass surface layer.
