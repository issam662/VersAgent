
$Source = @"
using System;
using System.Collections.Generic;
using System.Text;

public class CdpParserTest
{
    public static void Parse(string hexString)
    {
        // Remove spaces
        hexString = hexString.Replace(" ", "");
        byte[] data = new byte[hexString.Length / 2];
        for (int i = 0; i < data.Length; i++)
        {
            data[i] = Convert.ToByte(hexString.Substring(i * 2, 2), 16);
        }

        Console.WriteLine("Total Data Length: " + data.Length);
        
        // Mock pcap header length (we don't have header here, we just have data)
        int len = data.Length;

        // CDP Logic from Agent
        // Check for CDP 01:00:0c:cc:cc:cc
        if (data[0] == 0x01 && data[1] == 0x00 && data[2] == 0x0c && 
            data[3] == 0xcc && data[4] == 0xcc && data[5] == 0xcc)
        {
             Console.WriteLine("DEBUG: Found CDP Packet");
             
             // 14 Eth + 8 LLC/SNAP + 4 CDP Header = 26
             int offset = 22 + 4; 
             
             while (offset < len)
             {
                 if (offset + 4 > len) {
                     Console.WriteLine("DEBUG: Offset " + offset + " + 4 > Len " + len + ". Break.");
                     break;
                 }
                 
                 // Read 4 bytes TLV Header
                 // Type (2 bytes), Length (2 bytes)
                 int type = (data[offset] << 8) | data[offset+1];
                 int length = (data[offset+2] << 8) | data[offset+3];
                 
                 Console.WriteLine("DEBUG: CDP TLV Type: 0x" + type.ToString("X4") + " (" + type + ") Len: " + length);

                 if (type == 0x000a) // Native VLAN
                 {
                     if (length >= 4 && offset + 4 + 2 <= len) // Length includes header? No, usually excludes or includes?
                     {
                         // CDP TLV Length usually includes Type+Length (4 bytes).
                         // If Length is 4, then Value is 0 bytes?
                         // "Native VLAN" TLV is usually Type 0x000a, Length 0x0006 (4 header + 2 value)
                         
                         int valStart = offset + 4;
                         int valLen = length - 4; // Value length
                         
                         if (valLen >= 2) {
                            int vlan = (data[valStart] << 8) | data[valStart+1];
                            Console.WriteLine("DEBUG: Parsed CDP VLAN: " + vlan);
                         } else {
                            Console.WriteLine("DEBUG: VLAN TLV too short");
                         }
                     }
                 }
                 offset += length;
             }
        } else {
             Console.WriteLine("Not a CDP packet start.");
        }
    }
}
"@

Add-Type -TypeDefinition $Source -Language CSharp

# Hex dump from cdp_debug.txt (Line 24)
# Note: The log probably truncated the data!
# Log says: 01 00 0C CC CC CC ... 29 31 30
# 32 bytes printed.
# We need to simulate a larger packet to test the loop logic, or at least see the first TLV.
# The log shows: ... 00 01 00 29 ...
# Type: 00 01 (Device ID)
# Len: 00 29 (41 bytes)
# If the log truncated at byte 32, we can't test the loop fully, but we can verify the start.

$hex = "01 00 0C CC CC CC 98 A2 C0 18 1E 8C 01 DD AA AA 03 00 00 0C 20 00 02 B4 26 BA 00 01 00 29 31 30"
# Pad with zeros to simulate check
$hex += " 00" * 400

Write-Host "Testing CDP Parser Logic..."
[CdpParserTest]::Parse($hex)
