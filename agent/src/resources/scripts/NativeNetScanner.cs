using System;
using System.Collections.Generic;
using System.Management;
using System.Net.NetworkInformation;
using System.Threading;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace NativeNetScanner
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length > 0 && args[0].ToLower() == "listen")
            {
                ListenForChanges();
            }
            else if (args.Length > 0 && args[0].ToLower() == "adapters")
            {
                ListAdapters();
            }
            else
            {
                ScanSystem();
            }
        }

        static void ListenForChanges()
        {
            NetworkChange.NetworkAddressChanged += new NetworkAddressChangedEventHandler(AddressChangedCallback);
            NetworkChange.NetworkAvailabilityChanged += new NetworkAvailabilityChangedEventHandler(AvailabilityChangedCallback);
            Console.WriteLine("{\"status\": \"listening\"}");
            while (true)
            {
                Thread.Sleep(5000);
            }
        }

        static void AddressChangedCallback(object sender, EventArgs e)
        {
            Console.WriteLine("{\"event\": \"NetworkAddressChanged\"}");
        }

        static void AvailabilityChangedCallback(object sender, NetworkAvailabilityEventArgs e)
        {
            Console.WriteLine("{\"event\": \"NetworkAvailabilityChanged\", \"available\": " + (e.IsAvailable ? "true" : "false") + "}");
        }

        static void ListAdapters()
        {
            string json = "[";
            bool first = true;
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.NetworkInterfaceType != NetworkInterfaceType.Loopback && !ni.Description.ToLower().Contains("virtual") && !ni.Description.ToLower().Contains("pseudo"))
                    {
                        if (!first) json += ",";
                        json += "{\"name\":\"" + EscapeJson(ni.Name) + "\", \"description\":\"" + EscapeJson(ni.Description) + "\"}";
                        first = false;
                    }
                }
            }
            catch { }
            json += "]";
            Console.WriteLine(json);
        }

        static void ScanSystem()
        {
            // Network Defaults
            string vlanId = "-";
            bool isWireless = false;
            string ssid = "";
            string bssid = "";
            string switchPort = "";
            string switchName = "";
            string switchIp = "";
            string switchPlatform = "";
            string adapterName = "";
            string adapterDescription = "";
            string error = "";
            string defaultGateway = "";
            string physicalAdapters = "";

            // System Defaults
            string serialNumber = "UNKNOWN";
            string domain = "";
            string currentUser = "";
            string osName = "";
            string osVersion = "";
            string osBuild = "";
            string cpu = "Unknown";
            double totalDiskGB = 0;

            try
            {
                // -- 1. SYSTEM INFO (WMI) --
                try {
                    using (var searcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS")) {
                        foreach (ManagementObject obj in searcher.Get()) {
                            serialNumber = obj["SerialNumber"] != null ? obj["SerialNumber"].ToString() : "UNKNOWN";
                            break;
                        }
                    }
                } catch { }

                try {
                    using (var searcher = new ManagementObjectSearcher("SELECT Domain, UserName FROM Win32_ComputerSystem")) {
                        foreach (ManagementObject obj in searcher.Get()) {
                            domain = obj["Domain"] != null ? obj["Domain"].ToString() : "";
                            currentUser = obj["UserName"] != null ? obj["UserName"].ToString() : "";
                            break;
                        }
                    }
                } catch { }

                try {
                    using (var searcher = new ManagementObjectSearcher("SELECT Name FROM Win32_Processor")) {
                        foreach (ManagementObject obj in searcher.Get()) {
                            cpu = obj["Name"] != null ? obj["Name"].ToString() : "Unknown";
                            break;
                        }
                    }
                } catch { }

                try {
                    // Find the system drive letter (usually C:)
                    string systemDrive = "C:";
                    try {
                        using (var searcher = new ManagementObjectSearcher("SELECT SystemDrive FROM Win32_OperatingSystem")) {
                            foreach (ManagementObject obj in searcher.Get()) {
                                if (obj["SystemDrive"] != null) systemDrive = obj["SystemDrive"].ToString();
                                break;
                            }
                        }
                    } catch { }

                    using (var searcher = new ManagementObjectSearcher("SELECT Size FROM Win32_LogicalDisk WHERE DeviceID = '" + systemDrive + "'")) {
                        foreach (ManagementObject obj in searcher.Get()) {
                            if (obj["Size"] != null) {
                                long sizeBytes = Convert.ToInt64(obj["Size"]);
                                totalDiskGB = Math.Round((double)sizeBytes / (1024 * 1024 * 1024), 1);
                            }
                            break;
                        }
                    }
                    
                    // Fallback: If still 0, try any local disk
                    if (totalDiskGB == 0) {
                        using (var searcher = new ManagementObjectSearcher("SELECT Size FROM Win32_LogicalDisk WHERE DriveType = 3")) {
                            foreach (ManagementObject obj in searcher.Get()) {
                                if (obj["Size"] != null) {
                                    long sizeBytes = Convert.ToInt64(obj["Size"]);
                                    totalDiskGB = Math.Round((double)sizeBytes / (1024 * 1024 * 1024), 1);
                                    if (totalDiskGB > 0) break;
                                }
                            }
                        }
                    }
                } catch { }

                // -- 2. SYSTEM INFO (Registry OS) --
                try {
                    using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion")) {
                        if (key != null) {
                            osName = key.GetValue("ProductName") != null ? key.GetValue("ProductName").ToString() : "";
                            osVersion = key.GetValue("DisplayVersion") != null ? key.GetValue("DisplayVersion").ToString() : "";
                            string currentBuild = key.GetValue("CurrentBuild") != null ? key.GetValue("CurrentBuild").ToString() : "0";
                            string ubr = key.GetValue("UBR") != null ? key.GetValue("UBR").ToString() : "0";
                            osBuild = currentBuild + "." + ubr;

                            int buildNum;
                            if (int.TryParse(currentBuild, out buildNum) && buildNum >= 22000 && osName.StartsWith("Windows 10")) {
                                osName = osName.Replace("Windows 10", "Windows 11");
                            }
                            if (!string.IsNullOrEmpty(osName) && !string.IsNullOrEmpty(osVersion)) {
                                osName = osName + " " + osVersion;
                            }
                        }
                    }
                } catch { }

                // -- 3. NETWORK INFO --
                NetworkInterface activeInterface = null;
                var gatewayDict = new Dictionary<string, string>();
                var physicalList = new List<string>();

                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    bool isPhysical = ni.NetworkInterfaceType != NetworkInterfaceType.Loopback && !ni.Description.ToLower().Contains("virtual") && !ni.Description.ToLower().Contains("pseudo");
                    if (isPhysical) {
                        physicalList.Add(ni.Name);
                    }

                    if (ni.OperationalStatus == OperationalStatus.Up && isPhysical)
                    {
                        var ipProps = ni.GetIPProperties();
                        if (ipProps.GatewayAddresses.Count > 0)
                        {
                            foreach (var gw in ipProps.GatewayAddresses) {
                                if (gw.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork) {
                                    gatewayDict[ni.Id] = gw.Address.ToString();
                                    if (string.IsNullOrEmpty(defaultGateway)) defaultGateway = gw.Address.ToString();
                                }
                            }
                            if (activeInterface == null) activeInterface = ni;
                        }
                    }
                }

                if (activeInterface == null)
                {
                     foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                     {
                         if (ni.OperationalStatus == OperationalStatus.Up && ni.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                         {
                             activeInterface = ni;
                             break;
                         }
                     }
                }

                physicalAdapters = string.Join(",", physicalList.ToArray());

                if (activeInterface != null)
                {
                    adapterName = activeInterface.Name;
                    adapterDescription = activeInterface.Description;

                    if (activeInterface.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                    {
                        isWireless = true;
                        vlanId = "N/A (Wireless)";
                        
                        try {
                            var proc = new System.Diagnostics.Process {
                                StartInfo = new System.Diagnostics.ProcessStartInfo {
                                    FileName = "netsh",
                                    Arguments = "wlan show interfaces",
                                    UseShellExecute = false,
                                    RedirectStandardOutput = true,
                                    CreateNoWindow = true
                                }
                            };
                            proc.Start();
                            string output = proc.StandardOutput.ReadToEnd();
                            proc.WaitForExit();

                            var lines = output.Split('\n');
                            foreach (var line in lines) {
                                if (line.Trim().StartsWith("SSID") && !line.Trim().StartsWith("BSSID")) {
                                    var parts = line.Split(new[] { ':' }, 2);
                                    if(parts.Length > 1) ssid = parts[1].Trim();
                                }
                                if (line.Trim().StartsWith("BSSID")) {
                                    var parts = line.Split(new[] { ':' }, 2);
                                    if(parts.Length > 1) bssid = parts[1].Trim();
                                }
                            }
                        } catch { }
                    }
                        string foundVlan = null;
                        string lldpPort = null;

                        Thread wmiThread = new Thread(() => {
                            foundVlan = GetVlanFromRegistry(activeInterface.Description);
                            lldpPort = GetLldpPort(activeInterface.Name);
                        });
                        wmiThread.IsBackground = true;
                        wmiThread.Start();
                        
                        if (!wmiThread.Join(65000)) {
                            try { wmiThread.Abort(); } catch { }
                        }

                        if (string.IsNullOrEmpty(foundVlan)) {
                            foundVlan = GetVlanFromRegistryLoop(activeInterface.Description);
                        }

                        // Last resort: Automated Npcap Sniffing (requires Npcap installed)
                        if (string.IsNullOrEmpty(foundVlan) || string.IsNullOrEmpty(lldpPort)) {
                            string[] npcapResults = GetVlanAndLldpFromNpcap(activeInterface.Description);
                            if (string.IsNullOrEmpty(foundVlan) && !string.IsNullOrEmpty(npcapResults[0])) foundVlan = npcapResults[0];
                            if (string.IsNullOrEmpty(lldpPort) && !string.IsNullOrEmpty(npcapResults[1])) lldpPort = npcapResults[1];
                            if (!string.IsNullOrEmpty(npcapResults[2])) switchName = npcapResults[2];
                            if (!string.IsNullOrEmpty(npcapResults[3])) switchIp = npcapResults[3];
                            if (!string.IsNullOrEmpty(npcapResults[4])) switchPlatform = npcapResults[4];
                        }

                        if (!string.IsNullOrEmpty(foundVlan)) {
                            vlanId = foundVlan;
                        } else {
                            vlanId = "Not Detected";
                        }

                        if (!string.IsNullOrEmpty(lldpPort)) {
                            switchPort = lldpPort;
                        } else {
                            switchPort = "Unknown";
                        }
                }
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            string json = "{";
            json += "\"vlanId\": \"" + EscapeJson(vlanId) + "\",";
            json += "\"isWireless\": " + (isWireless ? "true" : "false") + ",";
            json += "\"ssid\": \"" + EscapeJson(ssid) + "\",";
            json += "\"bssid\": \"" + EscapeJson(bssid) + "\",";
            json += "\"switchPort\": \"" + EscapeJson(switchPort) + "\",";
            json += "\"switchName\": \"" + EscapeJson(switchName) + "\",";
            json += "\"switchIp\": \"" + EscapeJson(switchIp) + "\",";
            json += "\"switchPlatform\": \"" + EscapeJson(switchPlatform) + "\",";
            json += "\"adapterName\": \"" + EscapeJson(adapterName) + "\",";
            json += "\"adapterDescription\": \"" + EscapeJson(adapterDescription) + "\",";
            json += "\"defaultGateway\": \"" + EscapeJson(defaultGateway) + "\",";
            json += "\"physicalAdapters\": \"" + EscapeJson(physicalAdapters) + "\",";
            json += "\"serialNumber\": \"" + EscapeJson(serialNumber) + "\",";
            json += "\"domain\": \"" + EscapeJson(domain) + "\",";
            json += "\"currentUser\": \"" + EscapeJson(currentUser) + "\",";
            json += "\"osName\": \"" + EscapeJson(osName) + "\",";
            json += "\"osVersion\": \"" + EscapeJson(osVersion) + "\",";
            json += "\"osBuild\": \"" + EscapeJson(osBuild) + "\",";
            json += "\"cpu\": \"" + EscapeJson(cpu) + "\",";
            json += "\"totalDiskGB\": " + totalDiskGB.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",";
            json += "\"error\": \"" + EscapeJson(error) + "\"";
            json += "}";

            Console.WriteLine(json);
        }

        static string EscapeJson(string s) {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "");
        }

        static string GetVlanFromRegistry(string description)
        {
            try
            {
                using (ManagementObjectSearcher searcher = new ManagementObjectSearcher(@"root\StandardCimv2", "SELECT * FROM MSFT_NetAdapterAdvancedProperty WHERE RegistryKeyword = 'VlanID'"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        string name = obj["Name"] != null ? obj["Name"].ToString() : "";
                        string desc = obj["DisplayName"] != null ? obj["DisplayName"].ToString() : "";
                        if (name.Contains(description) || description.Contains(name) || desc.Contains(description) || description.Contains(desc)) {
                            return obj["RegistryValue"] != null ? obj["RegistryValue"].ToString() : null;
                        }
                    }
                }
            }
            catch { }
            return null;
        }

        static string GetVlanFromRegistryLoop(string description)
        {
            try
            {
                using (RegistryKey netClassKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Class\{4D36E972-E325-11CE-BFC1-08002BE10318}"))
                {
                    if (netClassKey != null)
                    {
                        foreach (string subkeyName in netClassKey.GetSubKeyNames())
                        {
                            using (RegistryKey subKey = netClassKey.OpenSubKey(subkeyName))
                            {
                                if (subKey != null)
                                {
                                    object desc = subKey.GetValue("DriverDesc");
                                    if (desc != null && (desc.ToString().Contains(description) || description.Contains(desc.ToString())))
                                    {
                                        object vlan = subKey.GetValue("VlanID");
                                        if (vlan != null) return vlan.ToString();
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch { }
            return null;
        }

        static string GetLldpPort(string adapterName)
        {
            try
            {
                using (ManagementObjectSearcher searcher = new ManagementObjectSearcher(@"root\StandardCimv2", "SELECT * FROM MSFT_NetAdapterLldpNeighbor"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        string name = obj["Name"] != null ? obj["Name"].ToString() : "";
                        if (name == adapterName || name.Contains(adapterName)) {
                            return obj["PortId"] != null ? obj["PortId"].ToString() : null;
                        }
                    }
                }
            }
            catch { }
            return null;
        }

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern int pcap_findalldevs(ref IntPtr alldevs, StringBuilder errbuf);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern void pcap_freealldevs(IntPtr alldevs);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern IntPtr pcap_open_live(string device, int snaplen, int promisc, int to_ms, StringBuilder errbuf);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern int pcap_next_ex(IntPtr p, ref IntPtr pkt_header, ref IntPtr pkt_data);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern void pcap_close(IntPtr p);

        [StructLayout(LayoutKind.Sequential)]
        struct pcap_if
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
            public int ts_sec;
            public int ts_usec;
            public uint caplen;
            public uint len;
        }

        static string[] GetVlanAndLldpFromNpcap(string adapterDescription)
        {
            string foundVlan = null;
            string foundPort = null;
            string foundSwitchName = null;
            string foundSwitchIp = null;
            string foundPlatform = null;

            try
            {
                // Check if npcap is installed
                string pcapPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "wpcap.dll");
                if (!File.Exists(pcapPath)) return new string[] { null, null, null, null, null };

                IntPtr alldevs = IntPtr.Zero;
                StringBuilder errbuf = new StringBuilder(256);

                if (pcap_findalldevs(ref alldevs, errbuf) == -1) return new string[] { null, null, null, null, null };

                string targetDevice = null;
                IntPtr current = alldevs;
                while (current != IntPtr.Zero)
                {
                    pcap_if iface = (pcap_if)Marshal.PtrToStructure(current, typeof(pcap_if));
                    if (iface.description != null && (iface.description.Contains(adapterDescription) || adapterDescription.Contains(iface.description)))
                    {
                        targetDevice = iface.name;
                        break;
                    }
                    current = iface.next;
                }

                if (targetDevice != null)
                {
                    IntPtr handle = pcap_open_live(targetDevice, 65536, 1, 1000, errbuf);
                    if (handle != IntPtr.Zero)
                    {
                        IntPtr headerPtr = IntPtr.Zero;
                        IntPtr dataPtr = IntPtr.Zero;
                        DateTime start = DateTime.Now;

                        while ((DateTime.Now - start).TotalSeconds < 65)
                        {
                            int res = pcap_next_ex(handle, ref headerPtr, ref dataPtr);
                            if (res <= 0) continue;

                            pcap_pkthdr header = (pcap_pkthdr)Marshal.PtrToStructure(headerPtr, typeof(pcap_pkthdr));
                            byte[] packet = new byte[header.caplen];
                            Marshal.Copy(dataPtr, packet, 0, (int)header.caplen);

                            // Process VLAN/LLDP/CDP
                            if (packet.Length >= 14)
                            {
                                // Check for 802.1Q (VLAN Tagging)
                                if (packet[12] == 0x81 && packet[13] == 0x00 && packet.Length >= 18)
                                {
                                    int vlan = ((packet[14] & 0x0F) << 8) | packet[15];
                                    if (foundVlan == null) foundVlan = vlan.ToString();
                                }

                                // CDP (Discovery Protocol)
                                if (packet[0] == 0x01 && packet[1] == 0x00 && packet[2] == 0x0C && packet[3] == 0xCC && packet[4] == 0xCC && packet[5] == 0xCC)
                                {
                                    int tlvStart = 26;
                                    for (int i = 12; i <= 18 && i < packet.Length - 8; i++)
                                    {
                                        if (packet[i] == 0xAA && packet[i+1] == 0xAA && packet[i+2] == 0x03 && packet[i+6] == 0x20 && packet[i+7] == 0x00)
                                        {
                                            tlvStart = i + 12; // Skip 8 byte LLC + 4 byte CDP Header
                                            break;
                                        }
                                    }

                                    int iCdp = tlvStart;
                                    while (iCdp < packet.Length - 4)
                                    {
                                        int type = (packet[iCdp] << 8) | packet[iCdp + 1];
                                        int length = (packet[iCdp + 2] << 8) | packet[iCdp + 3];

                                        if (length < 4 || iCdp + length > packet.Length) { iCdp++; continue; }

                                        if (type == 0x0001) // Device ID (Switch Name)
                                        {
                                            foundSwitchName = Encoding.ASCII.GetString(packet, iCdp + 4, length - 4).Trim();
                                        }
                                        else if (type == 0x0002) // Addresses (Switch IP)
                                        {
                                            if (iCdp + 16 < packet.Length && packet[iCdp + 10] == 0xCC && packet[iCdp + 12] == 0x04) {
                                                foundSwitchIp = string.Format("{0}.{1}.{2}.{3}", packet[iCdp + 13], packet[iCdp + 14], packet[iCdp + 15], packet[iCdp + 16]);
                                            }
                                        }
                                        else if (type == 0x0003) // Port ID
                                        {
                                            foundPort = Encoding.ASCII.GetString(packet, iCdp + 4, length - 4).Trim();
                                        }
                                        else if (type == 0x0006) // Platform
                                        {
                                            foundPlatform = Encoding.ASCII.GetString(packet, iCdp + 4, length - 4).Trim();
                                        }
                                        else if (type == 0x000A) // VLAN
                                        {
                                            if (length == 6) {
                                                int vlan = (packet[iCdp + 4] << 8) | packet[iCdp + 5];
                                                if (foundVlan == null) foundVlan = vlan.ToString();
                                            }
                                        }
                                        iCdp += length;
                                    }
                                }

                                // LLDP
                                if (packet[0] == 0x01 && packet[1] == 0x80 && packet[2] == 0xC2 && packet[3] == 0x00 && packet[4] == 0x00 && packet[5] == 0x0E)
                                {
                                    int offset = 14;
                                    if (packet.Length >= 18 && packet[12] == 0x81 && packet[13] == 0x00) offset += 4; // Skip 802.1Q tag
                                    
                                    while (offset < packet.Length - 2)
                                    {
                                        int tlvHeader = (packet[offset] << 8) | packet[offset + 1];
                                        int type = (tlvHeader >> 9) & 0x7F;
                                        int length = tlvHeader & 0x1FF;

                                        if (type == 0 || length == 0 || offset + 2 + length > packet.Length) break;
                                        
                                        if (type == 2) // Port ID
                                        {
                                            foundPort = Encoding.ASCII.GetString(packet, offset + 3, length - 1).Trim();
                                        }
                                        else if (type == 5) // System Name
                                        {
                                            foundSwitchName = Encoding.ASCII.GetString(packet, offset + 2, length).Trim();
                                        }
                                        else if (type == 6) // System Description (Platform)
                                        {
                                            foundPlatform = Encoding.ASCII.GetString(packet, offset + 2, length).Trim();
                                            if (foundPlatform.Length > 50) foundPlatform = foundPlatform.Substring(0, 47) + "...";
                                        }
                                        else if (type == 8) // Management Address (IP)
                                        {
                                            if (length >= 5 && packet[offset + 3] == 4) // IPv4
                                            {
                                                foundSwitchIp = string.Format("{0}.{1}.{2}.{3}", packet[offset + 4], packet[offset + 5], packet[offset + 6], packet[offset + 7]);
                                            }
                                        }
                                        else if (type == 127 && length >= 4 && offset + 5 < packet.Length) // Custom TLV (VLAN)
                                        {
                                            if (packet[offset + 2] == 0x00 && packet[offset + 3] == 0x80 && packet[offset + 4] == 0xC2 && packet[offset + 5] == 0x01)
                                            {
                                                int vlan = (packet[offset + 6] << 8) | packet[offset + 7];
                                                if (foundVlan == null) foundVlan = vlan.ToString();
                                            }
                                        }
                                        offset += 2 + length;
                                    }
                                }
                            }

                            if (foundVlan != null && foundPort != null && foundSwitchName != null) break;
                        }
                        pcap_close(handle);
                    }
                }
                pcap_freealldevs(alldevs);
            }
            catch { }

            return new string[] { foundVlan, foundPort, foundSwitchName, foundSwitchIp, foundPlatform };
        }

        static void RunHiddenCmd(string command)
        {
            try {
                var proc = new System.Diagnostics.Process {
                    StartInfo = new System.Diagnostics.ProcessStartInfo {
                        FileName = "cmd.exe",
                        Arguments = "/C " + command,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };
                proc.Start();
                proc.WaitForExit();
            } catch { }
        }

        static string HexToString(string hex)
        {
            try {
                string str = "";
                for (int i = 0; i < hex.Length; i += 2) {
                    if (i + 1 < hex.Length) {
                        try {
                            string hs = hex.Substring(i, 2);
                            int b = Convert.ToInt32(hs, 16);
                            if (b >= 32 && b <= 126) str += (char)b; // Printable ASCII
                        } catch { }
                    }
                }
                return str;
            } catch { return ""; }
        }
    }
}
