# Test Plan and Evidence Sheet

Use a dedicated test directory with disposable files. Never test cleanup on personal or system folders.

## Create test data (Windows PowerShell)
```powershell
$test = "$HOME\Desktop\dedup-test"
New-Item -ItemType Directory -Force $test | Out-Null
Set-Content "$test\alpha.txt" "OSSP file deduplication demo"
Copy-Item "$test\alpha.txt" "$test\alpha-copy.txt"
Set-Content "$test\unique.txt" "this content is different"
```

## Expected checks
- [ ] Three files scanned.
- [ ] One duplicate group identified.
- [ ] The two alpha files show the same SHA-256 fingerprint.
- [ ] `unique.txt` is not in the duplicate group.
- [ ] Recoverable space is approximately the size of one alpha file.
- [ ] Export CSV and open it.
- [ ] Select `alpha-copy.txt`; confirm cleanup only if you are using disposable test data.
- [ ] Verify `alpha.txt` remains and a rescan updates the metrics.

## Results table (fill during the actual run)
| Test ID | Expected | Actual result | Pass/Fail | Evidence screenshot |
|---|---|---|---|---|
| T1 | Exact duplicates detected | | | |
| T2 | Different contents remain unique | | | |
| T3 | Correct recoverable bytes | | | |
| T4 | Invalid path rejected | | | |
| T5 | Cleanup requires confirmation | | | |
| T6 | Report export works | | | |
