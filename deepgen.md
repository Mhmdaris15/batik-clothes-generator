---
license: apache-2.0
datasets:
- Alex11556666/Reason_Tuning
base_model:
- Qwen/Qwen2.5-VL-3B-Instruct
pipeline_tag: text-to-image
---

# 💡 DeepGen 1.0: A Lightweight Unified Multimodal Model for Advancing Image Generation and Editing
<p align="left">
  <a href="http://arxiv.org/abs/2602.12205">
    <img
      src="https://img.shields.io/badge/DeepGen 1.0-Paper-red?logo=arxiv&logoColor=red" style="display: inline-block; vertical-align: middle;"
      alt="DeepGen 1.0 Paper on arXiv"
    />
  </a>
  <a href="https://github.com/deepgenteam/deepgen" target="_blank" style="margin: 2px;">
      <img 
        alt="Github" src="https://img.shields.io/badge/DeepGen 1.0-Codebase-536af5?color=536af5&logo=github" style="display: inline-block; vertical-align: middle;"
        alt="DeepGen 1.0 Codebase"
      />
  </a>
    <a href="https://deepgenteam.github.io/" target="_blank" style="margin: 2px;">
      <img 
        alt="Github" src="https://img.shields.io/badge/Website-project page-orange" style="display: inline-block; vertical-align: middle;"
        alt="DeepGen 1.0 page"
      />
  </a>
</p>
DeepGen 1.0 is a lightweight unified multimodal model with only 5B parameters (3B VLM + 2B DiT). It integrates five core capabilities—general image generation, general image editing, reasoning image generation, reasoning image editing, and text rendering—within a single model. Across multiple authoritative benchmarks, DeepGen 1.0 is competitive with competitive with or surpassing the state-of-the-art unified multimodal models that are 3× to 16× larger, achieving comprehensive performance, demonstrating that massive scaling is not the sole path to high-performance multimodal generation.
<p align="left"><img src="bubble_chart.png" width="80%"></p>

## 🧠 Method
Our core observation is that a lightweight model, when empowered by synergistic architecture design and data-centric training strategies, can achieve comprehensive capabilities competitive with or even surpassing much larger counterparts.
To overcome the limitations of lightweight models in semantic understanding and fine-grained control, we introduce **Stacked Channel Bridging (SCB)**, a deep alignment framework that extracts hierarchical features from multiple VLM layers and fuses them with learnable ``think tokens'' to provide the generative backbone with structured, reasoning-rich guidance. 
We further design a data-centric training strategy spanning three progressive stages: (1) **Alignment Pre-training** on large-scale image-text pairs and editing triplets to synchronize VLM and DiT representations, (2) **Joint Supervised Fine-tuning** on a high-quality mixture of generation, editing, and reasoning tasks to foster omni-capabilities, and (3) **Reinforcement Learning with MR-GRPO**, which leverages a mixture of reward functions and supervision signals, resulting in substantial gains in generation quality and alignment with human preferences, while maintaining stable training progress and avoiding visual artifacts.

<p align="left"><img src="arch.png" width="80%"></p>

## 📊 Benchmarks

### 1. General Image Generation
| Model                 | Params      | Geneval ↑   | DPGBench ↑   | UniGenBench ↑ |
| --------------------- | ----------- | ----------- | ------------ | ------------- |
| OmniGen2                 | 3B + 4B         | 0.80         | 83.57         | 63.09        |
| BAGEL                 | 14B         | 0.82        | 85.10        | 61.53         |
| X-Omni                 | 7B + 12B         | 0.83         | 87.65🥉        | 53.77         |
| Lumina-DiMOO                 | 8B         | 0.88🥇          | 86.04        | 71.12         |
| Hunyuan-Image-3.0     | 80B         | 0.72        | 86.10        | —             |
| Qwen-Image            | 7B + 20B    | 0.87 🥈     | 88.32 🥇     | 78.81 🥇      |
| LongCat-Image         | 7B + 6B     | 0.87 🥈     | 86.80        | —             |
| Z-Image-Turbo         | 4B + 6B     | 0.84        | 85.15        | 71.40         |
| GLM-Image             | 9B + 7B     | —           | 84.78        | —             |
| **DeepGen 1.0 (SFT)** | **3B + 2B** | 0.86 🥉 | 87.05    | 74.18 🥉  |
| **DeepGen 1.0 (RL)**  | **3B + 2B** | 0.87 🥈 | 87.90 🥈 | 75.74 🥈  |



### 2. General Image Editing

| Model | Params | GEdit-EN ↑ | ImgEdit ↑ |
| :--- | :--- | :--- | :--- |
| BAGEL | 14B | 6.52 | 3.20 |
| Qwen-Image-Edit [2509] | 7B + 20B | 7.54 🥈 | 4.35 🥈 |
| LongCat-Image-Edit | 7B + 6B | 7.60 🥇 | 4.50 🥇 |
| Mammoth2 | 8B + 3B + 2B | 6.60 | 4.06 |
| **DeepGen 1.0 (SFT)** | **3B + 2B** | 7.12 | 4.09 |
| **DeepGen 1.0 (RL)** | **3B + 2B** | 7.17 🥉 | 4.14 🥉 |

### 3. Reasoning Image Generation
| Model | Params | WISE ↑ | T2I-CoREBench ↑ |
| :--- | :--- | :--- | :--- |
| OmniGen2 | 3B + 4B | 0.47 | 36.1 |
| BAGEL | 14B | 0.70 🥉 | 41.1 |
| Hunyuan-Image-3.0 | 80B | 0.57 | 46.0 |
| Qwen-Image | 7B + 20B | 0.62 | 46.3 🥉 |
| LongCat-Image | 7B + 6B | 0.65 | 52.2 🥇 |
| Z-Image-Turbo | 4B + 6B | - | 43.7 |
| **DeepGen 1.0 (SFT)** | **3B + 2B** | 0.72 🥈 | 45.7 |
| **DeepGen 1.0 (RL)** | **3B + 2B** | 0.73 🥇 | 46.5 🥈 |

### 4. Reasoning Image Editing

| Model | Params | RISE ↑ | UniREditBench ↑ |
| :--- | :--- | :--- | :--- |
| OmniGen2 | 3B + 4B | - | 43.4 |
| BAGEL | 14B | 11.9 🥈 | 51.0 |
| Qwen-Image-Edit [2509] | 7B + 20B | 8.9 | 56.5 🥉 |
| **DeepGen 1.0 (SFT)** | **3B + 2B** | 13.3 🥇 | 77.5 🥇 |
| **DeepGen 1.0 (RL)** | **3B + 2B** | 10.8 🥉 | 75.7 🥈 |

## 🎨 Quantitative results
<p align="left"><img src="teaser.png" width="80%"></p>

## 🛠️ Usage

### Merge ZIP Files
To use the DeepGen checkpoints, please merge the sharded model files first. We release Pre-traning, Supervised Fine-Tuning and Reinforcement Learning checkpoints.

```bash
# Merge zip
cat DeepGen_CKPT.zip.part-* > DeepGen_CKPT.zip
# Unzip DeepGen checkpoints 
unzip DeepGen_CKPT.zip
```

```text
checkpoints/
├── DeepGen_CKPT
    ├──Pretrain├──iter_200000.pth
    ├── SFT├──iter_400000.pth
    ├──RL├──MR-GDPO_final.pt 

```
if you want only final model state please use `model.pt` directly , it is same as `MR-GDPO_final.pt`

## ⭐ Citation
```bibtex
@article{wang2026deepgen,
  title={DeepGen 1.0: A Lightweight Unified Multimodal Model for Advancing Image Generation and Editing},
  author={Wang, Dianyi and Li, Ruihang and Han, Feng and Ma, Chaofan and Song, Wei and Wang, Siyuan and Wang, Yibin and Xin, Yi and Liu, Hongjian and Zhang, Zhixiong and others},
  journal={arXiv preprint arXiv:2602.12205},
  year={2026}
}
```