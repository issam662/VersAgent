
const API_URL = 'http://localhost:3003/api';
const API_KEY = 'test-api-key-which-is-long-enough-for-validation-32chars';

async function test() {
    try {
        console.log('Sending registration request...');
        const payload = {
            hostname: 'TEST-PC-HARDWARE',
            serialNumber: 'TEST-SERIAL-123',
            agentVersion: '1.0.0',
            osName: 'Windows 11 Pro',
            osVersion: '10.0.22631',
            osBuild: '22631',
            macAddresses: ['00-11-22-33-44-55'],
            ipAddresses: ['192.168.1.100'],
            cpu: 'Intel Core i7-12700K',
            totalMemoryGB: 32.0,
            domain: 'APTIV.COM',
            vlanId: '20'
        };

        const response = await fetch(`${API_URL}/agent/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${text}`);
        }

        const data = await response.json();
        console.log('Registration response:', response.status, data);

    } catch (err) {
        console.error('Registration failed:', err.message);
    }
}

test();
