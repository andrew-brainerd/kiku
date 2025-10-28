# Claude Code Preferences for kiku Project

## Package Manager

**ALWAYS USE PNPM** for this project.

### Commands to Use

✅ **Correct:**
```bash
pnpm install
pnpm add <package>
pnpm add -D <package>
pnpm remove <package>
pnpm run <script>
pnpm update
```

❌ **Do NOT use:**
```bash
npm install    # ❌ WRONG
npm add        # ❌ WRONG
yarn add       # ❌ WRONG
```

### Why pnpm?

1. This project uses `pnpm-lock.yaml` (not package-lock.json)
2. `.npmrc` specifies `package-manager=pnpm`
3. `package.json` has `"packageManager": "pnpm@10.6.2"`
4. Saves disk space with content-addressable storage
5. Faster installs than npm/yarn
6. Stricter dependency management

### Current Version

- **pnpm**: 10.6.2

### Quick Reference

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Add dependency | `pnpm add <package>` |
| Add dev dependency | `pnpm add -D <package>` |
| Run script | `pnpm run <script>` or `pnpm <script>` |
| Update deps | `pnpm update` |
| Remove package | `pnpm remove <package>` |

## Reminder

When you see any npm command in this project, mentally replace it with pnpm!
