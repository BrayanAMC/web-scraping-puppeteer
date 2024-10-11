import puppeteer from "puppeteer";
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scraping() {
    const startTime = process.hrtime();
    const initialMemoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

    const urlOrbisGPS = "https://orvis.gpschile.com/?lang=es";
    const username = process.env.USER;
    const password = process.env.PASSWORD;
    if (!username || !password) {
        console.error("Username or password is not defined in the environment variables.");
        return;
    }

    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);

    const browser = await puppeteer.launch({
        headless: true,
        slowMo: 200,
        timeout: 60000,
        protocolTimeout: 60000,
        //args: ['--no-sandbox', '--disable-setuid-sandbox'],
        //defaultViewport: null,
        //protocolTimeout: 120000
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(urlOrbisGPS, { waitUntil: 'networkidle2' });

    await page.type('#user', username);
    await page.type('#passw', password);
    await page.waitForSelector('#submit');
    await page.click('#submit');
    await new Promise(r => setTimeout(r, 15000));
    
    let items = [];
    const uniquePatents = new Set();
    let previousHeight = 0;
    let currentHeight = 0;
    
    while(true){
        //poder ver si se puede hacer hover
        await page.waitForSelector('.x-monitoring-unit-row');
        let rows = await page.$$('.x-monitoring-unit-row');
        let contador = 0;
        for(const row of rows){
            contador++;
            await row.evaluate(node => node.scrollIntoView());
            await row.hover();
            await new Promise(r => setTimeout(r, 2000));

            // Extraer la información del pop-up
            const additionalInfo = await page.evaluate(() => {
                const popup = document.querySelector('div#messageBoxWrapper.messageBoxWrapper_esoK');
                if (!popup) return null;
                
                const patent = popup.querySelector('div.name_TOAI');
                const location = popup.querySelector('div.addressName_WTb9');
                const odometer = popup.querySelector('td.mileage_j0GY div');
                const hourometer = popup.querySelector('td.engineHoursCounter_7QnA div');
                const lastUpdate = popup.querySelector('div.lastUpdate_oGrS');
                
                const formatDate = (dateString) => {
                    const [date, time] = dateString.split(' ');
                    const formattedDate = date.replace(/\./g, '/');
                    return `${formattedDate} ${time}`;
                };

                return {
                    patent: patent ? patent.innerText.trim() : null,
                    location: location ? location.innerText.trim() : null,
                    odometer: odometer ? odometer.innerText.trim() : null,
                    hourometer: hourometer ? hourometer.innerText.trim() : null,
                    lastUpdate: lastUpdate ? formatDate(lastUpdate.innerText.split('\n')[1].trim()) : null,
                    source: 'Orvis GPS'
                };
            });
            if (additionalInfo && !uniquePatents.has(additionalInfo.patent)) {
                uniquePatents.add(additionalInfo.patent);
                items.push(additionalInfo);
            }
        }
        await new Promise(r => setTimeout(r, 10000));
        previousHeight = currentHeight;
        currentHeight = await page.evaluate(() => {
            const scrollableContainer = document.querySelector('[data-test="ftbody"]');
            return scrollableContainer.scrollHeight;
        });
        
        if (currentHeight === previousHeight) {
            break;
        }
        
        await page.evaluate(() => {
            const scrollableContainer = document.querySelector('[data-test="ftbody"]');
            scrollableContainer.scrollTo(0, scrollableContainer.scrollHeight);
        });
        rows = await page.$$('.x-monitoring-unit-row');

    };
    console.log(items);
    console.log(items.length);
    await browser.close();
    // Guardar en JSON
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const jsonPath = path.join(outputDir, 'orvisgps.json');
    fs.writeFileSync(jsonPath, JSON.stringify(items, null, 2));

    const endTime = process.hrtime(startTime);
    const executionTimeInSeconds = endTime[0] + endTime[1] / 1e9;
    const finalMemoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const memoryUsed = finalMemoryUsage - initialMemoryUsage;

    const minutes = Math.floor(executionTimeInSeconds / 60);
    const seconds = (executionTimeInSeconds % 60).toFixed(2);
    console.log(`Archivo JSON creado: ${jsonPath}`);
    console.log(`Tiempo de ejecución: ${minutes} minutos y ${seconds} segundos`);
    console.log(`Memoria utilizada: ${memoryUsed.toFixed(2)} MB`);
}
scraping();