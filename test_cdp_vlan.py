
from scapy.all import sniff, Conf
from scapy.contrib.cdp import CDP
import sys
import threading

# VLAN ID is usually in CDP TLV Type 0x000a (Native VLAN)
# We can use the scapy contrib layer for CDP

def packet_callback(pkt):
    if CDP in pkt:
        # Check for Native VLAN TLV
        # In Scapy's CDP layer, it parses TLVs. We look for 'Generic_TLV' with type 10 (0x0a)
        # or specific fields if parsed.
        print(f"DEBUG: CDP Packet received from {pkt.src}")
        
        # Iterate layers/fields?
        # Scapy's CDP implementation might vary. 
        # Let's inspect the raw payload or known fields.
        
        # Try to find Native VLAN
        # Type: 0x000a
        try:
            # Scapy's CDP parser puts TLVs in the layer fields or payload
            cdp_layer = pkt[CDP]
            
            # Use raw parsing if needed, but let's try to access generic TLVs
            # Typically cdp_layer.msg handles the TLVs
            
            # Simple approach: Check for the specific byte sequence for VLAN if parsing is complex?
            # Better: Use Scapy's struct.
            
            # If we just want to verify it works, we can dump the packet
            # pkt.show() 
            
            pass
        except Exception as e:
            print(f"Error parse: {e}")

FOUND_VLAN = None

def stop_filter(pkt):
    global FOUND_VLAN
    if CDP in pkt:
        try:
            # Native VLAN TLV is Type 0x000a
            # Scapy usually decodes this into 'vlan' field if using correct contrib
            # Or we can iterate msg objects
            
            # Let's handle generic TLVs manually to be safe
            payload = bytes(pkt[CDP])
            # CDP Header is 4 bytes (Version, TTL, Checksum)
            # Then TLVs...
            
            # We can use scapy's get_field?
            # Let's assume the user has a recent scapy which has proper CDP support
            for tlv in pkt[CDP].msg:
                # 0x000a = 10 -> Native VLAN
                if tlv.type == 10:
                    FOUND_VLAN = tlv.val
                    print(f"SUCCESS: Found Native VLAN ID: {FOUND_VLAN}")
                    return True
        except Exception as e:
            print(f"Parsing generic error: {e}")
            
    return False

print("Starting CDP Sniffer on all interfaces (timeout 60s)...")
print("Waiting for logical switch port information...")

try:
    # timeout is essentially handled by the loop provided by sniff if using count?
    # but sniff blocks.
    sniff(filter="ether dst 01:00:0c:cc:cc:cc", prn=packet_callback, stop_filter=stop_filter, store=0, timeout=60, count=1)
    
    if FOUND_VLAN:
        print(f"FINAL RESULT: VLAN {FOUND_VLAN}")
    else:
        print("TIMED OUT: No CDP packets with VLAN information received.")
        print("Note: CDP packets are sent every 60 seconds by Cisco switches.")

except Exception as e:
    print(f"Sniffing Error: {e}")
    # Fallback/Help
    print("Ensure you have Npcap installed and run as Administrator.")
