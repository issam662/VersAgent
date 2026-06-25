
import sys
import time
import threading
import os
import json

# Try to import scapy. If not available, exit with specific code
try:
    from scapy.all import sniff, conf, get_if_list, Ether
    # Import LLDP and CDP from contrib
    from scapy.contrib.lldp import LLDPDU, LLDPDUPortVLANID
    from scapy.contrib.cdp import CDP
except ImportError:
    print("SCAPY_MISSING")
    sys.exit(1)

FOUND_VLAN = None
VLAN_LOCK = threading.Lock()

def process_packet(pkt, interface):
    global FOUND_VLAN
    
    with VLAN_LOCK:
        if FOUND_VLAN is not None:
            return True # Stop sniffing on this interface

    # Check for CDP (Cisco)
    if CDP in pkt:
        try:
            # Type 10 is Native VLAN
            for tlv in pkt[CDP].msg:
                if tlv.type == 10:
                    vlan = str(tlv.val)
                    with VLAN_LOCK:
                        if FOUND_VLAN is None:
                            FOUND_VLAN = vlan
                            print(f"VLAN_FOUND:{vlan}")
                            return True
        except Exception:
            pass

    # Check for LLDP (Standard)
    if LLDPDU in pkt:
        try:
            # Look for Port VLAN ID TLV (Org Specific or standard)
            # The standard Port VLAN ID is often in an Org Specific TLV (OUI 00:80:c2, Subtype 1)
            # Scapy often parses these if LLDP is loaded
            for tlv in pkt[LLDPDU].tlvlist:
                if isinstance(tlv, LLDPDUPortVLANID):
                    vlan = str(tlv.vlan_id)
                    with VLAN_LOCK:
                        if FOUND_VLAN is None:
                            FOUND_VLAN = vlan
                            print(f"VLAN_FOUND:{vlan}")
                            return True
        except Exception:
            pass
            
    return False

def sniff_on_interface(iface, timeout):
    try:
        # filter for CDP (01:00:0c:cc:cc:cc) or LLDP (01:80:c2:00:00:0e)
        # Using a broad filter to ensure we catch everything relevant
        filter_exp = "ether dst 01:00:0c:cc:cc:cc or ether dst 01:80:c2:00:00:0e"
        
        sniff(
            iface=iface,
            filter=filter_exp,
            stop_filter=lambda p: process_packet(p, iface),
            store=0,
            timeout=timeout
        )
    except Exception:
        # Silence interface-specific errors (e.g. interface down)
        pass

def main():
    # Switches typically send CDP/LLDP every 30 or 60 seconds
    # 65 seconds is the safe bet to catch at least one.
    timeout_sec = 65
    
    # Get all interfaces
    # On Windows, Scapy interface names can be GUIDs or friendly names
    interfaces = get_if_list()
    print(f"DEBUG: Found {len(interfaces)} interfaces: {', '.join(interfaces)}")
    
    threads = []
    for iface in interfaces:
        # Skip loopback
        if 'loopback' in iface.lower() or 'software loopback' in iface.lower():
            continue
            
        print(f"DEBUG: Starting sniffer on {iface}")
        t = threading.Thread(target=sniff_on_interface, args=(iface, timeout_sec))
        t.daemon = True
        threads.append(t)
        t.start()

    # Wait for completion or timeout
    start_time = time.time()
    while time.time() - start_time < timeout_sec:
        with VLAN_LOCK:
            if FOUND_VLAN is not None:
                print(f"DEBUG: Found VLAN {FOUND_VLAN} after {int(time.time() - start_time)}s")
                sys.exit(0)
        time.sleep(1)

    print("TIMEOUT")
    sys.exit(2)

if __name__ == "__main__":
    print("DEBUG: CDP/LLDP Sniffer started")
    main()
