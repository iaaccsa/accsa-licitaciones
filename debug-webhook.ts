const url = "https://nekto.app/webhook/a6a6c635-d1bc-44e6-9b2b-0473a631e010";

async function check() {
    try {
        const res = await fetch(url);
        console.log("Status:", res.status);
        const data = await res.json();
        console.log("Data:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

check();
