using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace CdpSniffer
{
    class Program
    {
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

        private static string _foundVlan = null;
        private static readonly object _lock = new object();
        private static readonly object _logLock = new object();
        private static string _logPath = "sniffer_log.txt";

        static void Log(string msg)
        {
            lock (_logLock)
            {
                string formatted = DateTime.Now.ToString("HH:mm:ss.fff") + " " + msg;
                Console.WriteLine(formatted);
                try { File.AppendAllText(_logPath, formatted + Environment.NewLine); } catch { }
            }
        }

        static void Main(string[] args)
        {
            if (File.Exists(_logPath)) {
                try { File.Delete(_logPath); } catch {}
            }
            Log("DEBUG: C# CDP/LLDP Sniffer started v4");

            // Check if npcap is installed
            string systemPath = Environment.GetFolderPath(Environment.SpecialFolder.System);
            string pcapPath = Path.Combine(systemPath, "wpcap.dll");
            if (!File.Exists(pcapPath))
            {
                Log("ERROR: Npcap (wpcap.dll) not found in " + systemPath + ". Please install Npcap.");
                Environment.Exit(1);
            }
            
            IntPtr alldevs = IntPtr.Zero;
            StringBuilder errbuf = new StringBuilder(256);

            try {
                if (pcap_findalldevs(ref alldevs, errbuf) == -1)
                {
                    Log("DEBUG: pcap_findalldevs failed: " + errbuf.ToString());
                    return;
                }
            } catch (Exception ex) {
                Log("ERROR: Failed to initialize Npcap: " + ex.Message);
                Environment.Exit(1);
            }

            List<string> devices = new List<string>();
            IntPtr current = alldevs;
            while (current != IntPtr.Zero)
            {
                pcap_if iface = (pcap_if)Marshal.PtrToStructure(current, typeof(pcap_if));
                if (!string.IsNullOrEmpty(iface.name))
                {
                    devices.Add(iface.name);
                    Log("DEBUG: Found interface: " + iface.name + " (" + iface.description + ")");
                }
                current = iface.next;
            }

            if (devices.Count == 0)
            {
                Log("DEBUG: No network interfaces found.");
                pcap_freealldevs(alldevs);
                return;
            }

            Log("DEBUG: Starting sniffer threads on " + devices.Count + " interfaces");

            foreach (var device in devices)
            {
                string devName = device;
                Thread t = new Thread(() => Sniff(devName));
                t.IsBackground = true;
                t.Start();
            }

            int timeout = 75000; // Increased to 75s
            int elapsed = 0;
            while (elapsed < timeout)
            {
                lock (_lock)
                {
                    if (_foundVlan != null)
                    {
                        Log("VLAN_FOUND:" + _foundVlan);
                        Log("SUCCESS: Closing sniffer.");
                        Environment.Exit(0);
                    }
                }
                Thread.Sleep(1000);
                elapsed += 1000;
            }

            Log("TIMEOUT: No VLAN discovered after 75s.");
            pcap_freealldevs(alldevs);
            Environment.Exit(0);
        }

        static void Sniff(string deviceName)
        {
            Log("DEBUG: Sniffing thread entry for " + deviceName);
            StringBuilder errbuf = new StringBuilder(256);
            
            // Try different configurations if needed, but standard usually works
            IntPtr handle = pcap_open_live(deviceName, 65536, 1, 100, errbuf);
            if (handle == IntPtr.Zero)
            {
                Log("DEBUG: ERROR pcap_open_live " + deviceName + ": " + errbuf.ToString());
                return;
            }

            Log("DEBUG: Device opened successfully: " + deviceName);

            IntPtr headerPtr = IntPtr.Zero;
            IntPtr dataPtr = IntPtr.Zero;

            try {
                while (true)
                {
                    int res = pcap_next_ex(handle, ref headerPtr, ref dataPtr);
                    if (res == 0) continue; // Timeout
                    if (res < 0) {
                        Log("DEBUG: pcap_next_ex error on " + deviceName);
                        break;
                    }

                    pcap_pkthdr header = (pcap_pkthdr)Marshal.PtrToStructure(headerPtr, typeof(pcap_pkthdr));
                    if (header.caplen > 0) {
                        byte[] packet = new byte[header.caplen];
                        Marshal.Copy(dataPtr, packet, 0, (int)header.caplen);
                        ProcessPacket(packet, deviceName);
                    }

                    lock (_lock)
                    {
                        if (_foundVlan != null) break;
                    }
                }
            } catch (Exception ex) {
                Log("DEBUG: ERROR in Sniff loop for " + deviceName + ": " + ex.Message);
            } finally {
                pcap_close(handle);
            }
        }

        static void ProcessPacket(byte[] packet, string deviceName)
        {
            if (packet.Length < 14) return;

            bool isCdp = packet[0] == 0x01 && packet[1] == 0x00 && packet[2] == 0x0C && packet[3] == 0xCC && packet[4] == 0xCC && packet[5] == 0xCC;
            bool isLldp = packet[0] == 0x01 && packet[1] == 0x80 && packet[2] == 0xC2 && packet[3] == 0x00 && packet[4] == 0x00 && packet[5] == 0x0E;

            if (isCdp)
            {
                Log("DEBUG: [CDP] Packet seen on " + deviceName);
                for (int i = 20; i < packet.Length - 4; i++)
                {
                    if (packet[i] == 0x00 && packet[i + 1] == 0x0A) // Type 10
                    {
                        int length = (packet[i + 2] << 8) | packet[i + 3];
                        if (length == 6 && i + 5 < packet.Length)
                        {
                            int vlan = (packet[i + 4] << 8) | packet[i + 5];
                            Log("DEBUG: [CDP] Extracted VLAN: " + vlan);
                            lock (_lock) { if (_foundVlan == null) _foundVlan = vlan.ToString(); }
                            return;
                        }
                    }
                }
            }
            else if (isLldp)
            {
                Log("DEBUG: [LLDP] Packet seen on " + deviceName);
                int offset = 14;
                while (offset < packet.Length - 2)
                {
                    int tlvHeader = (packet[offset] << 8) | packet[offset + 1];
                    int type = (tlvHeader >> 9) & 0x7F;
                    int length = tlvHeader & 0x1FF;

                    if (type == 0) break; // End of LLDPDU

                    if (type == 127 && length >= 4 && offset + 2 + length <= packet.Length)
                    {
                        if (packet[offset + 2] == 0x00 && packet[offset + 3] == 0x80 && packet[offset + 4] == 0xC2)
                        {
                            byte subtype = packet[offset + 5];
                            if (subtype == 0x01) // Port VLAN ID
                            {
                                int vlan = (packet[offset + 6] << 8) | packet[offset + 7];
                                Log("DEBUG: [LLDP] Extracted VLAN (00-80-C2 Subtype 1): " + vlan);
                                lock (_lock) { if (_foundVlan == null) _foundVlan = vlan.ToString(); }
                                return;
                            }
                        }
                    }
                    offset += 2 + length;
                }
            }
        }
    }
}
