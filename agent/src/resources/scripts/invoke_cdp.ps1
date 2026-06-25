
param (
    [switch]$ListOnly,
    [string]$TargetAdapter
)

$Source = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Net.NetworkInformation;
using System.Collections.Generic;
using System.Threading;

public class CdpSniffer
{
    [DllImport("wpcap.dll", CharSet = CharSet.Ansi)]
    public static extern int pcap_findalldevs(ref IntPtr alldevs, StringBuilder errbuf);

    [DllImport("wpcap.dll", CharSet = CharSet.Ansi)]
    public static extern void pcap_freealldevs(IntPtr alldevs);

    [DllImport("wpcap.dll", CharSet = CharSet.Ansi)]
    public static extern IntPtr pcap_open_live(string device, int snaplen, int promisc, int to_ms, StringBuilder errbuf);

    [DllImport("wpcap.dll", CharSet = CharSet.Ansi)]
    public static extern void pcap_close(IntPtr p);

    [DllImport("wpcap.dll", CharSet = CharSet.Ansi)]
    public static extern int pcap_next_ex(IntPtr p, ref IntPtr pkt_header, ref IntPtr pkt_data);

    // pcap_compile and pcap_setfilter if we want kernel filtering, but manual check is fine for short duration
    // Actually we should filter to avoid flood.
    [DllImport("wpcap.dll", CharSet = CharSet.Ansi)]
    public static extern int pcap_compile(IntPtr p, IntPtr fp, string str, int optimize, uint netmask);

    [DllImport("wpcap.dll", CharSet = CharSet.Ansi)]
    public static extern int pcap_setfilter(IntPtr p, IntPtr fp);
    
    [DllImport("wpcap.dll", CharSet = CharSet.Ansi)]
    public static extern void pcap_freecode(IntPtr fp);

    [StructLayout(LayoutKind.Sequential)]
    public struct pcap_if 
    {
        public IntPtr next;
        public string name;
        public string description;
        public IntPtr addresses;
        public uint flags;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct pcap_pkthdr 
    {
        public int ts_sec;      // 32-bit on Windows (even x64)
        public int ts_usec;     // 32-bit on Windows (even x64)
        public uint caplen;
        public uint len;
    }

    // BPF Program struct is opaque usually but needed for compile
    [StructLayout(LayoutKind.Sequential)]
    public struct bpf_program 
    {
        public uint bf_len;
        public IntPtr bf_insns;
    }

    public class InterfaceInfo {
        public string Name;
        public string Description;
    }

    public static string GetInterfaces()
    {
        IntPtr alldevs = IntPtr.Zero;
        StringBuilder errbuf = new StringBuilder(256);

        if (pcap_findalldevs(ref alldevs, errbuf) == -1)
            return "[]";

        List<string> jsonItems = new List<string>();
        IntPtr d = alldevs;
        while (d != IntPtr.Zero)
        {
            pcap_if dev = (pcap_if)Marshal.PtrToStructure(d, typeof(pcap_if));
            if (dev.name != null) {
                string desc = dev.description ?? "";
                string name = dev.name;
                
                // Filter out non-physical adapters
                bool isVirtual = desc.Contains("WAN Miniport") || 
                                 desc.Contains("Loopback") || 
                                 desc.Contains("Virtual") || 
                                 desc.Contains("Pseudo");
                
                if (!isVirtual) {
                    string safeDesc = desc.Replace("\\", "\\\\").Replace("\"", "\\\"");
                    string safeName = name.Replace("\\", "\\\\").Replace("\"", "\\\"");
                    jsonItems.Add("{\"name\": \"" + safeName + "\", \"description\": \"" + safeDesc + "\"}");
                }
            }
            d = dev.next;
        }
        pcap_freealldevs(alldevs);
        
        return "[" + string.Join(",", jsonItems.ToArray()) + "]";
    }

    public static string FindVlan(string targetAdapter) 
    {
        IntPtr alldevs = IntPtr.Zero;
        StringBuilder errbuf = new StringBuilder(256);

        if (pcap_findalldevs(ref alldevs, errbuf) == -1)
            return "Error finding devices: " + errbuf.ToString();

        List<string> devices = new List<string>();
        IntPtr d = alldevs;
        while (d != IntPtr.Zero)
        {
            pcap_if dev = (pcap_if)Marshal.PtrToStructure(d, typeof(pcap_if));
            if (dev.name != null) {
                // Filter if targetAdapter is provided
                if (!string.IsNullOrEmpty(targetAdapter)) {
                     if (dev.name == targetAdapter) {
                         devices.Add(dev.name);
                     }
                } else {
                     devices.Add(dev.name);
                }
            }
            d = dev.next;
        }
        pcap_freealldevs(alldevs);

        string foundVlan = null;
        
        List<Thread> threads = new List<Thread>();
        object lockObj = new object();

        foreach (string devName in devices)
        {
            if (devName.Contains("Loopback")) continue;

            string localDevName = devName; // Fix closure capture

            Thread t = new Thread(() => 
            {
                IntPtr adhandle = pcap_open_live(localDevName, 65536, 1, 1000, errbuf);
                if (adhandle == IntPtr.Zero) return;

                // Manual check for simplicity/stability.
                
                DateTime start = DateTime.Now;
                int pktCount = 0;
                // CDP packets are sent every 60 seconds. Wait at least 65s.
                while ((DateTime.Now - start).TotalSeconds < 65 && foundVlan == null)
                {
                    IntPtr header = IntPtr.Zero;
                    IntPtr data = IntPtr.Zero;
                    int res = pcap_next_ex(adhandle, ref header, ref data);
                    
                    if (res > 0)
                    {
                         pktCount++;
                         // if (pktCount % 50 == 0) Console.WriteLine("Captured " + pktCount + " packets on " + localDevName);

                         byte[] macDst = new byte[6];
                         Marshal.Copy(data, macDst, 0, 6);
                         
                         // Check for CDP 01:00:0c:cc:cc:cc
                         if (macDst[0] == 0x01 && macDst[1] == 0x00 && macDst[2] == 0x0c && 
                             macDst[3] == 0xcc && macDst[4] == 0xcc && macDst[5] == 0xcc)
                         {
                              // CDP Detected
                              Console.WriteLine("DEBUG: Found CDP Packet on " + localDevName);

                              int offset = 22 + 4; 
                              pcap_pkthdr h = (pcap_pkthdr)Marshal.PtrToStructure(header, typeof(pcap_pkthdr));
                              int len = (int)h.caplen;
                              
                              while (offset < len)
                              {
                                  if (offset + 4 > len) break;
                                  byte[] tlvHeader = new byte[4];
                                  Marshal.Copy(new IntPtr(data.ToInt64() + offset), tlvHeader, 0, 4);
                                  int type = (tlvHeader[0] << 8) | tlvHeader[1];
                                  int length = (tlvHeader[2] << 8) | tlvHeader[3];
                                  
                                  Console.WriteLine("DEBUG: CDP TLV Type: 0x" + type.ToString("X4") + " Len: " + length);

                                  if (type == 0x000a) // Native VLAN
                                  {
                                      if (length >= 4 && offset + 4 + 2 <= len)
                                      {
                                          byte[] val = new byte[2];
                                          Marshal.Copy(new IntPtr(data.ToInt64() + offset + 4), val, 0, 2);
                                          int vlan = (val[0] << 8) | val[1];
                                          Console.WriteLine("DEBUG: Parsed CDP VLAN: " + vlan);
                                          lock(lockObj) { if (foundVlan == null) foundVlan = vlan.ToString(); }
                                          break;
                                      }
                                  }
                                  offset += length;
                              }
                         }
                         
                         // Check for LLDP EtherType 0x88CC (Offset 12)
                         // OR 802.1Q Tag (Offset 12 = 0x8100), then EthType is at 16
                         byte[] ethPtr = new byte[2];
                         Marshal.Copy(new IntPtr(data.ToInt64() + 12), ethPtr, 0, 2);
                         
                         int actualEthType = (ethPtr[0] << 8) | ethPtr[1];
                         int l3Offset = 14; 
                         
                         if (actualEthType == 0x8100) {
                             // VLAN Tagged
                             Marshal.Copy(new IntPtr(data.ToInt64() + 16), ethPtr, 0, 2);
                             actualEthType = (ethPtr[0] << 8) | ethPtr[1];
                             l3Offset = 18; // 14 + 4 bytes tag
                         }

                         // DEBUG: Log ALL non-IP traffic to find LLDP
                         if (actualEthType != 0x0800 && actualEthType != 0x86DD && actualEthType != 0x0806) // Ignore IPv4, IPv6, ARP
                         {
                             // Dump header
                             byte[] raw = new byte[32];
                             Marshal.Copy(data, raw, 0, 32);
                             string hex = BitConverter.ToString(raw).Replace("-", " ");
                             Console.WriteLine("DEBUG: Non-IP Packet Type: 0x" + actualEthType.ToString("X4") + " Data: " + hex);
                         }

                         if (actualEthType == 0x88CC)
                         {
                             // LLDP Detected
                             Console.WriteLine("DEBUG: Found LLDP Packet on " + localDevName);
                             
                             int offset = l3Offset; // Start of LLDPDU
 
                             pcap_pkthdr h = (pcap_pkthdr)Marshal.PtrToStructure(header, typeof(pcap_pkthdr));
                             int len = (int)h.caplen;

                             while (offset < len)
                             {
                                 if (offset + 2 > len) break;
                                 byte[] tlvHeader = new byte[2];
                                 Marshal.Copy(new IntPtr(data.ToInt64() + offset), tlvHeader, 0, 2);
                                 
                                 int type = (tlvHeader[0] >> 1) & 0x7F;
                                 int length = ((tlvHeader[0] & 0x01) << 8) | tlvHeader[1];
                                 
                                 Console.WriteLine("DEBUG: TLV Type: " + type + " Len: " + length);

                                 if (type == 0) break; // End of LLDPDU

                                 // Type 127 = Org Specific
                                 if (type == 127 && length >= 4)
                                 {
                                     // OUI (3 bytes) + Subtype (1 byte)
                                     byte[] oui = new byte[4];
                                     if (offset + 2 + 4 <= len) {
                                         Marshal.Copy(new IntPtr(data.ToInt64() + offset + 2), oui, 0, 4);
                                         
                                         string ouiStr = BitConverter.ToString(oui);
                                         Console.WriteLine("DEBUG: Org TLV OUI: " + ouiStr);

                                         if (oui[0] == 0x00 && oui[1] == 0x80 && oui[2] == 0xc2 && oui[3] == 0x01) {
                                             Console.WriteLine("DEBUG: Found IEEE 802.1 Port VLAN ID TLV");
                                             // Found Port VLAN ID
                                             if (offset + 2 + 4 + 2 <= len) {
                                                 byte[] val = new byte[2];
                                                 Marshal.Copy(new IntPtr(data.ToInt64() + offset + 2 + 4), val, 0, 2);
                                                 int vlan = (val[0] << 8) | val[1];
                                                 Console.WriteLine("DEBUG: Parsed VLAN: " + vlan);
                                                 lock(lockObj) { if (foundVlan == null) foundVlan = vlan.ToString(); }
                                                 break;
                                             }
                                         }
                                     }
                                 }
                                 offset += 2 + length;
                             }
                         }
                    }
                }
                pcap_close(adhandle);
                // Marshal.FreeHGlobal(fcode);
            });
            threads.Add(t);
            t.Start();
        }

        foreach (Thread t in threads) t.Join();
        
        return foundVlan;
    }
}
"@



try {
    Add-Type -TypeDefinition $Source -Language CSharp
    
    if ($ListOnly) {
        # Log diagnostics to agent_debug.txt if possible
        $debugFile = Join-Path $env:APPDATA "APTIV System Service\agent_debug.txt"
        $diag = "`n[$(Get-Date -Format 'HH:mm:ss')] --- Network discovery diagnostics ---`n"
        
        # Get physical adapters (including disconnected ones for the dropdown list)
        $adapters = Get-NetAdapter -Physical | Select-Object Name, InterfaceGuid, InterfaceDescription, MacAddress, Status
        $diag += "Windows Physical Adapters: $($adapters.Count)`n"
        foreach ($a in $adapters) { $diag += " - $($a.Name) | Status: $($a.Status) | ID: $($a.InterfaceGuid) | Desc: $($a.InterfaceDescription)`n" }

        # v1.0.74 FIX: Catch DllNotFoundException if Npcap is missing entirely
        $pcapDevices = @()
        try {
            $pcapJson = [CdpSniffer]::GetInterfaces()
            $pcapDevices = $pcapJson | ConvertFrom-Json
            $diag += "Npcap Devices: $($pcapDevices.Count)`n"
            foreach ($d in $pcapDevices) { $diag += " - Desc: $($d.description) | ID: $($d.name)`n" }
        }
        catch {
            $diag += "Failed to invoke Npcap (wpcap.dll likely missing): $($_.Exception.Message)`n"
        }

        try { $diag | Out-File -FilePath $debugFile -Append -Encoding utf8 } catch { }
        
        $friendlyDevices = foreach ($dev in $pcapDevices) {
            # Find matching physical adapter by Guid, Description, or Name
            $match = $adapters | Where-Object { 
                $cleanGuid = $_.InterfaceGuid.ToString().Replace("{", "").Replace("}", "")
                $dev.name -like "*$cleanGuid*" -or 
                $dev.description -eq $_.InterfaceDescription -or
                $dev.description -like "*$($_.Name)*"
            }
            
            if ($match) {
                [PSCustomObject]@{
                    name        = $dev.name
                    description = $match.Name
                }
            }
            elseif ($dev.description -notlike "*Loopback*" -and $dev.description -notlike "*Npcap*") {
                # Fallback: If no direct match to a 'Physical' record, but it's not a loopback, show it
                [PSCustomObject]@{
                    name        = $dev.name
                    description = $dev.description
                }
            }
        }

        # v1.0.72 FIX: Robust Fallback if Npcap fails/missing
        if ($null -eq $friendlyDevices -or $friendlyDevices.Count -eq 0) {
            $diag += "Npcap list was empty. Falling back to native Windows Physical Adapters.`n"
            try { $diag | Out-File -FilePath $debugFile -Append -Encoding utf8 } catch { }
            
            $friendlyDevices = foreach ($a in $adapters) {
                [PSCustomObject]@{
                    name        = $a.Name # Use the native name instead of the Npcap UID
                    description = $a.InterfaceDescription
                }
            }
        }

        # Final protection: if the list is STILL empty, return an empty array string
        if ($null -eq $friendlyDevices) { $friendlyDevices = @() }
        # v1.0.69 FIX: Force array output even if single item
        $json = $friendlyDevices | ConvertTo-Json -Compress
        if ($friendlyDevices.Count -eq 1 -and $json -notlike "[*]") { $json = "[$json]" }
        if ($null -eq $friendlyDevices -or $friendlyDevices.Count -eq 0) { $json = "[]" }
        [Console]::WriteLine("INTERFACES_JSON:$json")
        exit
    }

    $vlan = [CdpSniffer]::FindVlan($TargetAdapter)
    if ($vlan) {
        [Console]::WriteLine("VLAN_FOUND:$vlan")
    }
    else {
        [Console]::WriteLine("TIMEOUT")
    }
}
catch {
    [Console]::WriteLine("ERROR: $_")
}
