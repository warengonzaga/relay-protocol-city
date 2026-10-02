# Relay World asset credits

Downloaded and license-checked on September 30, 2026. Models are bundled locally so the city does not depend on a third-party asset host at runtime. Only selected GLBs, their required textures, and their license notices are included.

## Kenney models

Models in the following folders are by **Kenney**, dedicated to the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Each folder contains the original pack's `License.txt`.

| Local folder under `public/models/` | Original source | Included assets |
| --- | --- | --- |
| `city-kit-commercial/` | [City Kit (Commercial)](https://kenney.nl/assets/city-kit-commercial) | Buildings A–J, skyscrapers A–C, parasol A; original and two alternate color palettes |
| `city-kit-suburban/` | [City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban) | Houses A–C, large and small trees; original and alternate color palettes |
| `city-kit-roads/` | [City Kit (Roads)](https://kenney.nl/assets/city-kit-roads) | Curved streetlights, double streetlight, traffic light |
| `car-kit/` | [Car Kit](https://kenney.nl/assets/car-kit) | Sedan, taxi, pickup truck, delivery truck, van |
| `train-kit/` | [Train Kit](https://kenney.nl/assets/train-kit) | Electric city train A–C, locomotive A, box carriage, straight railroad |
| `blocky-characters/` | [Blocky Characters](https://kenney.nl/assets/blocky-characters) | Characters A–C with the original 27 skeletal animation clips, including `walk` |

The GLBs are unmodified. Source folder names are retained because each Kenney pack references its own `Textures/colormap.png`. Do not flatten these textures into one shared file. The extra building palettes can be assigned as material maps; use `flipY = false` and sRGB color space when loading replacement textures for glTF materials.

## Airplane and bus attribution

These two models have a different license from the Kenney models. Preserve these credits in distributed copies and make them available from the website's credits link:

- **[Airplane](https://poly.pizza/m/8ciDd9k8wha) by Poly by Google**, licensed under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/). Original GLB unmodified. 1,292 triangles.
- **[Bus](https://poly.pizza/m/4CPpvEmrMoF) by Poly by Google**, licensed under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/). Original GLB unmodified. 2,226 triangles.

Application use may scale, animate, tint, or decorate the models with chain-route labels. Those runtime changes are by the Relay World contributors. No endorsement by the original creators is implied. A plain-text copy of this attribution is in `public/models/poly-google/ATTRIBUTION.txt`.

## Model integration

`public/models/manifest.json` records each public URL, unscaled bounding-box size, minimum/maximum bounds, animation names, file size, source, creator, and license. Bounds are calculated from glTF accessor bounds with scene-node transformations applied. Character bounds describe the rest pose; animated limbs can extend beyond them.

All moving assets face **local +Z** and use **+Y up**. Kenney vehicle nodes identify front wheels at positive Z. The bus mirrors are at positive Z; the airplane nose gear is at positive Z. Buildings are ground-aligned, while the airplane is centered around its original modeling origin and needs centering/normalization. The railroad model is offset below zero and along Z; normalize its bounds before placement.

| Model | Native size X × Y × Z |
| --- | --- |
| `character-a` / `b` / `c` | 1.6 × 2.7 × 0.8 |
| `sedan` | 1.5 × 1.3 × 2.55 |
| `delivery` | 1.5 × 1.65 × 3.25 |
| `truck` | 1.5 × 1.3 × 2.95 |
| `train-electric-city-a` | 1.1 × 1.6828 × 2.4 |
| `train-electric-city-c` | 1.1 × 1.6828 × 2.7 |
| `bus` | 50.0606 × 48.8071 × 157.4611 |
| `airplane` | 1566.5557 × 580.7159 × 1675.7847 |
| `building-a` | 0.8836 × 1.293 × 0.94 |
| `building-skyscraper-a` | 1.36 × 2.88 × 1.36 |
| `tree-large` | 0.2104 × 0.767 × 0.243 |

Use relative scaling rather than treating these arbitrary authoring units as real meters. A 7-unit maximum footprint fits ordinary commercial buildings at approximately 6–8× native scale. Preserve the model silhouette instead of stretching each axis independently.

The complete selection is approximately 4.8 MB before HTTP compression. Load only the models the scene actually uses, reuse geometry and materials for static clones, and use Three.js `SkeletonUtils.clone` when duplicating animated characters.

## Typography and original artwork

DM Sans regular and bold are bundled in `public/fonts/`, from the [DM Sans project](https://github.com/googlefonts/dm-fonts), under the SIL Open Font License 1.1. The complete notice is included as `public/fonts/OFL.txt`.

The city layout, favicon, interface icons, and simplified chain-mark drawings were authored for this application. Chain marks identify networks and do not imply endorsement. There are no generated raster images in the shipping interface.

## Relay dark branding update

The active font is **Inter**, bundled as `public/fonts/inter-variable.ttf` from the [Google Fonts Inter repository](https://github.com/google/fonts/tree/main/ofl/inter), under SIL OFL 1.1 (`public/fonts/Inter-OFL.txt`). The earlier DM Sans files remain available but are not used by the current interface.

Interface colors and Inter usage were checked against the official [Relay Kit base styles](https://github.com/relayprotocol/relay-kit/blob/main/packages/ui/src/styles/base.css) and [Relay Kit theme](https://github.com/relayprotocol/relay-kit/blob/main/packages/ui/src/themes/RelayKitTheme.ts): dark canvas `#161616`, surfaces `#1c1c1c` / `#232323`, primary `#4615c8`, and accent text `#a7aaff`. The public site's source fetch was rate-limited, so this is an official design-system match rather than a pixel comparison with relay.link.

`public/relay-wordmark.svg` is the unmodified white Relay wordmark linked from [Relay's official brand assets](https://docs.relay.link/resources/brand-assets), retrieved from [its published asset](https://mintcdn.com/unevenlabs/Gbv82V37Oid9F6eG/logo/relay-white.svg). Relay's brand and trademarks are not covered by this project's GPL v3 source license.
