import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

// const uri = process.env.MONGODB_URI;
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = process.env.DATABASE_NAME;

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let database;

async function connectToMongoDB() {
  try {
    await client.connect();
    database = client.db(DATABASE_NAME);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

async function getDatabase() {
  if (!database) {
    await connectToMongoDB();
  }
  return database;
}

async function closeDatabase() {
  await client.close();
}

export { closeDatabase, connectToMongoDB, getDatabase };
