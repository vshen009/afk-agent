---
name: grill-me
description: A relentless interview to sharpen a plan or design.
disable-model-invocation: true
---

## vstack Update Guard

Before executing this skill, call the `vstack-update` skill. If it reports an update, show the local and remote versions and wait for **现在更新** or **本次跳过**. If it cannot check remotely, state that fact and continue this run.

Call the Skill tool with "grilling".
