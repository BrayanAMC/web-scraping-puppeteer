import { exec } from 'child_process';

// Función para ejecutar un script
function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const process = exec(`node ${scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error al ejecutar ${scriptPath}:`, error);
        reject(error);
      } else {
        console.log(`Resultado de ${scriptPath}:`, stdout);
        resolve(stdout);
      }
    });

    process.stdout.pipe(process.stdout);
    process.stderr.pipe(process.stderr);
  });
}

// Función principal para ejecutar los 3 scripts en paralelo y luego el de SharePoint
async function runAll() {
  try {
    console.log("Ejecutando los 3 scripts de scraping simultáneamente...");

    // Ejecutar los 3 scripts de scraping en paralelo
    await Promise.all([
      runScript('orvisgpsScraping.js'),  // Reemplaza con el nombre de tu primer script
      runScript('volvoConnectScraping.js'),  // Reemplaza con el nombre de tu segundo script
      runScript('cubiqScraping.js')   // Reemplaza con el nombre de tu tercer script
    ]);

    console.log("Todos los scripts de scraping han terminado.");

    // Ejecutar el script de SharePoint después de que los 3 de scraping hayan terminado
    console.log("Ejecutando el script para subir a SharePoint...");
    await runScript('updateSharepoint.js'); // Reemplaza con el nombre de tu script de SharePoint

    console.log("Todos los scripts han sido ejecutados exitosamente.");
  } catch (error) {
    console.error("Error durante la ejecución de los scripts:", error);
  }
}

// Ejecutar todos los scripts
runAll();
