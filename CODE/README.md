# Deduply — File Deduplication System

**OSSP Hackathon project** · Local-first file deduplication using SHA-256 content fingerprints.

## Features
- Recursively scans a user-selected directory.
- Skips common repository/system clutter (`.git`, `node_modules`, recycle/system folders) and does not follow symbolic links.
- Computes SHA-256 hashes of file contents; uses size as a pre-filter/grouping component.
- Groups identical files even if their names differ.
- Estimates recoverable storage while preserving one recommended original per group.
- Allows explicit selection and confirmation before removing duplicate copies.
- Exports duplicate inventory to CSV and full scan data to JSON.
- Includes a demo mode for presentations; demo mode cannot delete files.

## Requirements
- Node.js 18 or newer
- Windows, macOS, or Linux
- No npm dependencies required

## Run on Windows
1. Extract the ZIP.
2. Open the extracted `File_Deduplication_System` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:
   ```powershell
   node --version
   npm start
   ```
5. Open **http://127.0.0.1:3000** in your browser.
6. Keep the terminal open while using the website.

Enter a specific folder path, for example:
`C:\Users\YourName\Downloads\dedup-test`

## Run on macOS / Linux
```bash
cd File_Deduplication_System
node --version
npm start
```
Open `http://127.0.0.1:3000` and enter a path such as `/Users/yourname/Downloads/dedup-test`.

## Safe demonstration (recommended)
Create a test folder containing copies of a few non-important files. For example on PowerShell:
```powershell
mkdir "$HOME\Desktop\dedup-test" -Force
Set-Content "$HOME\Desktop\dedup-test\notes.txt" "same content"
Copy-Item "$HOME\Desktop\dedup-test\notes.txt" "$HOME\Desktop\dedup-test\notes-copy.txt"
Set-Content "$HOME\Desktop\dedup-test\unique.txt" "different content"
```
Scan the folder path. The app should identify `notes.txt` and `notes-copy.txt` as duplicates, while `unique.txt` remains unique. Test deletion only with files you intentionally created for this demonstration.

## How it works
1. **Directory traversal:** recursively enumerates regular files.
2. **Pre-filter:** files are grouped using byte size; only files with matching size and matching SHA-256 digest are duplicates.
3. **Fingerprinting:** Node.js streams each file through `crypto.createHash('sha256')`; this avoids loading an entire large file into memory.
4. **Duplicate grouping:** content-equivalent files are grouped; one path is recommended to keep.
5. **Cleanup:** the server accepts only paths marked as non-original duplicates by the latest scan, verifies they are inside the scanned root, then deletes only after explicit confirmation.
6. **Validation:** after deletion, the directory is rescanned and dashboard metrics update.

## API
- `GET /api/status` — local server status
- `POST /api/scan` — JSON body: `{"directory":"absolute/path/to/folder"}`
- `POST /api/delete` — JSON body: `{"paths":["absolute/path/to/duplicate"]}`

## Security and limitations
- The server binds to `127.0.0.1`, not the public network.
- Use only folders you own or have permission to manage.
- Deletion is permanent. Review paths and keep backups; this is a hackathon prototype, not an enterprise recovery tool.
- Symbolic links are skipped; common system/repository folders are excluded.
- A scan hashes every file it examines, so very large trees can take time.
- The browser UI and API are designed for local use. Do not expose this server to the internet.
- Demo data is fictional and must not be presented as a real scan result.

## Suggested GitHub repository description
A local-first file deduplication dashboard that detects identical content using SHA-256, estimates storage savings, and enables carefully confirmed cleanup.

## Team role split (adapt to your actual team)
- Member 1: UI/UX and dashboard.
- Member 2: Node.js file traversal and SHA-256 engine.
- Member 3: duplicate grouping, storage-savings calculations, and safe cleanup.
- Member 4: test cases, report, GitHub README, and live demo.
