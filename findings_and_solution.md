# Network Accessibility Analysis

## 1. Findings

The website works on `http://localhost:5173/` but not via your IP address because of how development servers (like Vite) are configured by default.

### Default Behavior
By default, Vite (the tool running your frontend) only "listens" for connections coming from the same machine. This is a security feature to prevent unauthorized access while you are developing. It binds to the loopback address `127.0.0.1` (localhost).

### Current Configuration
In your [vite.config.ts](file:///c:/Users/ahhpks/Documents/App/PFE%20PROJECT/client/vite.config.ts), the `server` block is missing the `host` option. Without this option, it will not accept connections from other devices on your network.

### Secondary Obstacle: Firewall
Even if you configure Vite to listen on your IP, Windows Firewall might block incoming traffic on port `5173`. I found a script [open_firewall.ps1](file:///c:/Users/ahhpks/Documents/App/PFE%20PROJECT/open_firewall.ps1) in your project, but it currently only opens port `3002` (used by your backend server).

---

## 2. Solution

To allow other PCs on your network to access your website, you need to perform two steps:

### Step A: Update Vite Configuration
You need to tell Vite to listen on all network interfaces. You can do this in two ways:

#### Option 1: Modify `vite.config.ts` (Recommended)
Update the `server` section in `client/vite.config.ts` to include `host: true`:

```typescript
export default defineConfig({
  server: {
    host: true, // This allows access via your IP address
    proxy: {
      // ... your existing proxy settings
    },
  },
  plugins: [react()],
})
```

#### Option 2: Use the command line
When starting the client, add the `--host` flag:
`npm run dev -- --host`

### Step B: Open Port 5173 in Windows Firewall
You need to allow incoming traffic on port `5173`. You can do this by running this command in a PowerShell window (as Administrator):

```powershell
netsh advfirewall firewall add rule name="Vite Frontend (TCP 5173)" dir=in action=allow protocol=TCP localport=5173
```

---

## 3. How to Access
Once you've made these changes:
1. Restart your Vite dev server.
2. It should now show something like:
   - `Local: http://localhost:5173/`
   - `Network: http://192.168.x.x:5173/`
3. Use that **Network** URL on your other PC. Both devices must be on the same Wi-Fi/Ethernet network.
