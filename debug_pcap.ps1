
$Source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
using System.Threading;

public class PcapDumper
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
        public IntPtr ts_sec;
        public IntPtr ts_usec;
        public uint caplen;
        public uint len;
    }

    public static void Dump() 
    {
        IntPtr alldevs = IntPtr.Zero;
        StringBuilder errbuf = new StringBuilder(256);

        if (pcap_findalldevs(ref alldevs, errbuf) == -1) {
            Console.WriteLine("Error finding devices: " + errbuf.ToString());
            return;
        }

        List<string> devices = new List<string>();
        IntPtr d = alldevs;
        while (d != IntPtr.Zero)
        {
            pcap_if dev = (pcap_if)Marshal.PtrToStructure(d, typeof(pcap_if));
            if (dev.name != null) {
                if (!dev.name.ToLower().Contains("loopback")) {
                    devices.Add(dev.name);
                    Console.WriteLine("Found device: " + dev.description);
                }
            }
            d = dev.next;
        }
        pcap_freealldevs(alldevs);

        List<Thread> threads = new List<Thread>();

        foreach (string devName in devices)
        {
            // Capture loop variable for closure? C# 5+ handles this, but let's be safe
            string localDevName = devName;
            
            Thread t = new Thread(() => 
            {
                IntPtr adhandle = pcap_open_live(localDevName, 65536, 1, 1000, errbuf);
                if (adhandle == IntPtr.Zero) return;

                // Console.WriteLine("Sniffing on " + localDevName);
                
                DateTime start = DateTime.Now;
                while ((DateTime.Now - start).TotalSeconds < 45)
                {
                    IntPtr header = IntPtr.Zero;
                    IntPtr data = IntPtr.Zero;
                    int res = pcap_next_ex(adhandle, ref header, ref data);
                    
                    if (res > 0)
                    {
                         byte[] macDst = new byte[6];
                         Marshal.Copy(data, macDst, 0, 6);
                         string dstStr = BitConverter.ToString(macDst);

                         bool interesting = false;
                         if (dstStr.StartsWith("01-80-C2")) interesting = true; // L2 Multicast (STP/LLDP)
                         if (dstStr.StartsWith("01-00-0C-CC-CC")) interesting = true; // CDP

                         if (interesting) {
                             // Dump first 32 bytes
                             byte[] raw = new byte[32];
                             Marshal.Copy(data, raw, 0, 32);
                             string hex = BitConverter.ToString(raw).Replace("-", " ");
                             Console.WriteLine("RAW: " + hex + " on " + localDevName);
                         }
                    }
                }
                pcap_close(adhandle);
            });
            threads.Add(t);
            t.Start();
        }

        foreach (Thread t in threads) t.Join();
    }
}
'@

Add-Type -TypeDefinition $Source -Language CSharp
[PcapDumper]::Dump()
