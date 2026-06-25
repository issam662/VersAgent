

async function testFetch() {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    // Try multiple formats
    const formats = [
        { name: 'Original', start: sevenDaysAgo.toISOString().replace(/\.\d+Z$/, '.000'), end: now.toISOString().replace(/\.\d+Z$/, '.000') },
        { name: 'With Z', start: sevenDaysAgo.toISOString().replace(/\.\d+Z$/, '.000Z'), end: now.toISOString().replace(/\.\d+Z$/, '.000Z') },
        { name: 'Pure ISO', start: sevenDaysAgo.toISOString(), end: now.toISOString() }
    ];

    for (const fmt of formats) {
        const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${fmt.start}&pubEndDate=${fmt.end}`;
        console.log(`\nTesting ${fmt.name}: ${url}`);
        try {
            const res = await fetch(url);
            console.log(`Status: ${res.status}`);
            if (!res.ok) {
                console.log(`Error: ${await res.text()}`);
            } else {
                const data = await res.json();
                console.log(`Success! Total results: ${data.totalResults}`);
                break;
            }
        } catch (e) {
            console.error("Fetch failed:", e.message);
        }
    }
}

testFetch();
