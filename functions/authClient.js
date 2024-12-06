import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import dotenv from 'dotenv';

dotenv.config();

const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;

const credential = new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);

export const client = Client.init({
    authProvider: async (done) => {
        try {
            const token = await credential.getToken("https://graph.microsoft.com/.default");
            done(null, token.token);
        } catch (error) {
            console.error("Error obteniendo el token:", error);
            done(error, null);
        }
    },
});