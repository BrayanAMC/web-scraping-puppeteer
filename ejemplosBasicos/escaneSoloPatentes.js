import puppeteer from "puppeteer";
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

dotenv.config();

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
        headless: false,
        slowMo: 200,
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(urlOrbisGPS, { waitUntil: 'networkidle2' });

    await page.type('#user', username);
    await page.type('#passw', password);
    await page.click('#submit');
    await new Promise(r => setTimeout(r, 15000));
    

    let items = [];
    const uniquePatents = new Set();
    const vehicleTargetCount = 4;
    //let vehicles = await page.$$('.monitoring-unit-name-cell');
    //console.log(vehicles.length);
    let previousHeight = 0;
    let currentHeight = 0;
    while(true){
        console.log("entro al while");
        const newItems = await page.evaluate(() => {
            const items = Array.from(
                document.querySelectorAll('.x-monitoring-unit-row ')
            );
        
            return items.map((item) => {
                const patent = item.querySelector('.monitoring-unit-name-cell > div > span').innerText;
                return{
                    patent
                }
            })
        })
        newItems.forEach((newItem) => {
            if (!uniquePatents.has(newItem.patent)) {
                uniquePatents.add(newItem.patent);
                items.push(newItem);
            }
        });
        await new Promise(r => setTimeout(r, 10000));
        
        previousHeight = currentHeight;
        currentHeight = await page.evaluate(() => {
            const scrollableContainer = document.querySelector('[data-test="ftbody"]');
            return scrollableContainer.scrollHeight;
        });
        
        if (currentHeight === previousHeight) {
            console.log("Se ha llegado al final del scroll.");
            break;
        }
        
        await page.evaluate(() => {
            const scrollableContainer = document.querySelector('[data-test="ftbody"]');
            scrollableContainer.scrollTo(0, scrollableContainer.scrollHeight);
        });

    };
    console.log("salio del while");
    console.log(items);
    console.log(items.length);

    /*for (let i = 0; i < rows.length; i++) {
        await page.hover(`#monitoring_units_target tbody tr:nth-child(${i + 1})`);
        
        const rowData = await page.evaluate(() => {
            const popup = document.querySelector('div#messageBoxWrapper.messageBoxWrapper_esoK');
            if (!popup) return null;
            
            const patentElement = popup.querySelector('div.name_TOAI');
            const locationElement = popup.querySelector('div.addressName_WTb9');
            //const speedElement = popup.querySelector('td.speed_BuUT div');
            const odometerElement = popup.querySelector('td.mileage_j0GY div');
            const hourometerElement = popup.querySelector('td.engineHoursCounter_7QnA div');
            const lastUpdateElement = popup.querySelector('div.lastUpdate_oGrS ');
            
            return {
                patent: patentElement ? patentElement.innerText.trim() : null,
                location: locationElement ? locationElement.innerText.trim() : null,
                //speed: speedElement ? speedElement.innerText.trim() : null,     
                hourometer: hourometerElement ? hourometerElement.innerText.trim() : null,    
                odometer: odometerElement ? odometerElement.innerText.trim() : null,
                lastUpdate: lastUpdateElement ? lastUpdateElement.innerText.trim() : null
                
            };
        });
        
        if (rowData && !allData.some(item => item.patent === rowData.patent)) {
            allData.push(rowData);
        }
        
        await new Promise(r => setTimeout(r, 2000));
    }*/


    //await browser.close();

    // Guardar en JSON
    /*const jsonPath = path.join('orvisData.json');
    fs.writeFileSync(jsonPath, JSON.stringify(allData, null, 2));

    const endTime = process.hrtime(startTime);
    const executionTimeInSeconds = endTime[0] + endTime[1] / 1e9;
    const finalMemoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const memoryUsed = finalMemoryUsage - initialMemoryUsage;

    console.log(`Archivo JSON creado: ${jsonPath}`);
    console.log(`Tiempo de ejecución: ${executionTimeInSeconds.toFixed(2)} segundos`);
    console.log(`Memoria utilizada: ${memoryUsed.toFixed(2)} MB`);
    console.log(`Número de registros procesados: ${allData.length}`);*/
}

scraping();//Este codigo hace el web scraping y luego los resultados los guarda en un archivo excel y json 
                   //Que luego son utilizados por el archivo updateSharepoint.js que manda este json a sharepoint.