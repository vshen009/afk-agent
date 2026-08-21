---
name: vstack-update
description: Check whether the installed vstack repository is behind origin/main, display the local and remote versions, and update only after the user confirms. Use before running any vstack skill.
disable-model-invocation: true
---

# vstack Update Guard

Before running the calling skill, run:

```bash
python3 scripts/vstack_update.py check
```

On Windows, use `py scripts/vstack_update.py check`.

Report the **current version** and **remote version** from the command output.

- `up_to_date`: say the installed version is current, then continue with the calling skill.
- `update_available`: show both versions and ask the user to choose exactly one: **现在更新** or **本次跳过**. Do not run the calling skill until they choose.
- **现在更新**: run `python3 scripts/vstack_update.py update` (or `py` on Windows). It only uses `git pull --ff-only origin main` after verifying that the checkout is clean and on `main`. Report the result, then continue with the calling skill.
- **本次跳过**: do not write any persistent preference; continue with the calling skill for this request only.
- `check_failed`: state that the remote check could not be completed, then continue with the calling skill. Never block offline work.

Do not expose tokens, credentials, local configuration, or generated artifacts in the version report.
