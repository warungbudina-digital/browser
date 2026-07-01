# git commit -m with a multi-line message breaks when nested inside ssh + sudo bash -c

## What went wrong

Tried to commit on VPS CHR (`/root/mikrotik-CHR`, root-owned, only reachable
as a non-root SSH user) in one shot:

```bash
sshpass -e ssh user@host '
sudo bash -c "
cd /root/mikrotik-CHR
git commit -m \"multi-line message with an em-dash (—) and parentheses ()\"
"
'
```

Failed with `unexpected EOF while looking for matching \`"'` / `syntax error
near unexpected token \`)'`. Three layers of shell quoting (local shell →
ssh's remote command string → `sudo bash -c`'s string) each need their own
escaping, and it silently breaks once the message has its own quotes,
parens, or multi-byte punctuation — same root problem as the existing note
on hand-building JSON with embedded JS for `/browser/request`, just a
different transport.

## Fix

Never hand-escape a multi-line string through nested shell layers. Write
the message to a local file, copy it over, then reference the file:

```bash
# 1. Write the message locally (Write tool, not a heredoc in bash)
# 2. Copy it to the remote host as root via tee (works with only sudo, no scp needed):
sshpass -e ssh user@host "sudo tee /tmp/commit-msg.txt > /dev/null" < local-msg.txt
# 3. Commit using -F, then clean up:
sshpass -e ssh user@host 'sudo git -C /root/mikrotik-CHR commit -F /tmp/commit-msg.txt && sudo rm /tmp/commit-msg.txt'
```

This also sidesteps `sudo bash -c "cd ... && ..."` entirely — `git -C <dir>`
does the `cd` for you, so there's one less quoting layer to get wrong.

## Verification

```bash
sshpass -e ssh user@host 'sudo git -C /root/mikrotik-CHR log --oneline -1'
# commit message should render with its original punctuation intact, not truncated/mangled
```
