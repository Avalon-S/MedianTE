# Median Temporal Ensembling

**Training-Free Robust Aggregation for Action-Chunked Visuomotor Policies**

Yuhang Jiang, University of Trento

[Project page](https://avalon-s.github.io/MedianTE/) ·
[arXiv](https://arxiv.org/abs/2609.27167)

Action-chunked policies such as ACT and Diffusion Policy predict every executed action
several times. Temporal ensembling averages those predictions with an exponentially
weighted mean, so a single corrupted prediction can pull the command arbitrarily far.
Taking the coordinate-wise median of the same predictions is a one-line change that needs
no retraining. Whenever fewer than half of the covering predictions are corrupted, the
median stays within the range of the clean ones.

```python
# temporal ensembling (ACT): exponentially weighted mean
w = np.exp(-m * age); w = w / w.sum()
action = (w[:, None] * A).sum(axis=0)

# median temporal ensembling
action = np.median(A, axis=0)
```

`A` holds the overlapping predictions for the current timestep, one row per query.

## Code

Coming soon.

## Citation

```bibtex
@article{jiang2026median,
  title   = {Median Temporal Ensembling: Training-Free Robust
             Aggregation for Action-Chunked Visuomotor Policies},
  author  = {Jiang, Yuhang},
  journal = {arXiv preprint arXiv:2609.27167},
  year    = {2026}
}
```
