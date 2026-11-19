# Judge0 code execution service (Vigil coding)

The coding environment compiles and runs student code in **Judge0 CE 1.13.1**, never inside the IntegrityOS backend. Each run happens in an `isolate` sandbox with:

- no network access (`ALLOW_ENABLE_NETWORK=false`)
- CPU time, wall time, memory and stack limits
- a cap on processes and threads (stops fork bombs)
- a cap on output file size
- a private filesystem that is destroyed after every run

| Language | Compiler / runtime in the image | Judge0 ID |
| -------- | ------------------------------- | --------- |
| C        | GCC 9.2.0                       | 50        |
| C++17    | G++ 9.2.0 (`-std=c++17 -O2`)    | 54        |
| Java     | OpenJDK 13.0.1 (class `Main`)   | 62        |
| Python   | Python 3.8.1                    | 71        |

## Local setup (Windows)

1. Install **Docker Desktop** with the WSL 2 backend, then restart your PC.
2. Generate secrets and wire the backend. This creates `judge0.conf`, which is git-ignored, and adds `JUDGE0_URL` and `JUDGE0_AUTH_TOKEN` to `backend/.env`:
   ```powershell
   powershell -ExecutionPolicy Bypass -File infra/judge0/setup.ps1
   ```
3. Start Judge0:
   ```powershell
   cd infra/judge0
   docker compose up -d
   ```
4. Check it. The first start takes a minute while the database initialises:
   ```powershell
   curl.exe -H "X-Auth-Token: <AUTHN_TOKEN from judge0.conf>" http://localhost:2358/about
   ```
5. Restart the backend. `GET /api/coding/health` should report `reachable: true` and all four languages available.

### If runs fail with "Internal Error" or "Failed to create control group"

Judge0 1.13.x needs **cgroup v1**, but recent kernels and Docker Desktop default to cgroup v2. Choose one:

- **Recommended for real exams:** run Judge0 on an Ubuntu 22.04 VM. Set `GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"` in `/etc/default/grub`, then run `sudo update-grub` and reboot.
- **Docker Desktop on Windows:** add the following to `%UserProfile%\.wslconfig`, run `wsl --shutdown`, then restart Docker Desktop. This setting depends on your WSL kernel version and is not guaranteed to work. If it doesn't, use a Linux VM.
  ```
  [wsl2]
  kernelCommandLine = systemd.unified_cgroup_hierarchy=0
  ```

## Production

- The backend on Render cannot run privileged containers. Host Judge0 on a small Linux VM (2 to 4 vCPU per ~50 concurrent students; raise `COUNT` to add workers).
- Do not expose port 2358 publicly. Use a private network or VPN, or put a reverse proxy with TLS in front that only accepts the backend's IP. Keep `AUTHN_TOKEN` secret.
- Set `JUDGE0_URL` and `JUDGE0_AUTH_TOKEN` in the backend's environment.

## What happens when Judge0 is down

- **Run / Compile buttons:** the student sees "Code execution service unavailable". Their code is still autosaved.
- **Grading:** retries at 1, 2, 5, 10 and 20 minutes. If it still fails, the submission is flagged for faculty as `infrastructure_error`. It is never marked as a student error.
