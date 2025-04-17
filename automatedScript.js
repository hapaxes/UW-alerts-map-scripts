import puppeteer from "puppeteer";

import {
  extractHeavyData,
  extractLightData,
  getDataFromPost,
  getPostText,
} from "./initialDataScrape.js";
import { getDatabase, closeDatabase } from "./mongo.js";
import {
  run,
  extractLocationPrompt,
  extractCategoriesPrompt,
} from "./gemini.cjs";
import { getGeocodeFromLocation } from "./googleMapsApi.cjs";
import { promisify } from "util";
import { Resend } from "resend";

const sleep = promisify(setTimeout);
/**
 * go through all posts and find the post with the earliest post date
 * start at that url
 * while (nextarticle) exists
 * get articleObj from that page
 * double check post_id to make sure it doesn't exist in our database
 * upload to database
 * click next
 *
 */

/**
 * method connecting to mongodb getting the url of the newest post
 *
 * check if that post exists in the database
 *
 * if exists, break
 * otherwise:
 *
 */

async function sendEmail(
  articleText,
  categories,
  location,
  post_id,
  result,
  url
) {
  const API_KEY = process.env.RESEND_API_KEY;
  const EMAIL = process.env.PERSONAL_EMAIL_ADDRESS;

  const resend = new Resend(API_KEY);

  const htmlBody = `
    <div>
      <h2>
        articleText: <pre>${articleText.slice(0, 1000)}...</pre>
      </h2>
      <p>post_url: ${url}</p>
      <p>post_id: ${post_id}</p>
      <p>${location ? location.join(", ") : "no location"}</p>
      <p>${categories ? categories.join(", ") : "no categories..."}</p>
      <p>mongoDB response: ${result}</p>
    </div>
  `;

  await resend.emails.send({
    from: "onboarding@resend.dev",
    to: EMAIL,
    subject: "U-District alerts map, new post confirmation",
    html: htmlBody,
  });
}

async function scrapeDataFromPage(
  page,
  currentUrl,
  lightCollection,
  postHtmlCollection
) {
  try {
    await page.goto(currentUrl, { waitUntil: "networkidle2" });

    // Extract post data
    const obj = await getDataFromPost(page);
    const articleText = await getPostText(page, obj.post_id);
    const address = await run(extractLocationPrompt(articleText));
    const categoriesArr = await run(extractCategoriesPrompt(articleText));
    const categories = categoriesArr?.trim().split(", ");

    if (categories) {
      obj.categories = categories;
    }

    if (address === "N/A") {
      // do nothing
    } else {
      const location = await getGeocodeFromLocation(
        address + ", University District, Seattle"
      );
      if (location === "N/A") {
        // do nothing
      } else {
        obj.location = location;
      }
    }

    // {post_id, url, title, date: {upload_date, update_date}, location: {latitude, longitude}, categories: ["category1", "category2", "category3"]}
    const lightData = extractLightData(obj);

    // {post_id, post: {title, headerHTML, contentHTML}}
    const heavyData = extractHeavyData(obj);

    // check "lightCollection" whether the current object exists within it, if it does, skip this one
    // if it doesn't, upload both light data and heavy data to database
    const post_id = obj.post_id;
    const data = await lightCollection.findOne({ post_id });

    // this post hasn't been uploaded before
    if (!data) {
      const result = await lightCollection.insertOne({ lightData });
      const url = obj.url;
      const location = obj?.location;
      const categories = obj?.categories;
      sendEmail(articleText, url, location, categories, post_id, result);
    }

    // Check if the "nav-next" button exists
    const nextButtonExists = await page.evaluate(() => {
      return !!document.querySelector("div.nav-next a");
    });

    if (nextButtonExists) {
      // Click the "nav-next" button
      await page.evaluate(() => {
        const navNextDiv = document.querySelector("div.nav-next");
        if (navNextDiv) {
          const firstLink = navNextDiv.querySelector("a");
          if (firstLink) {
            firstLink.click();
          }
        }
      });

      // Wait for navigation
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      // Update current URL
      const nextUrl = page.url();
      return nextUrl;
    } else {
      return null;
    }
  } catch (e) {
    console.log(e.message);
    throw new Error(e);
  }
}

async function scrapeBlogPosts(startUrl, mongoDbDatabase) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const MONGO_COLLECTION_LIGHT_DATA = process.env.MONGO_COLLECTION_LIGHT_DATA;
  const MONGO_COLLECTION_POST_HTML = process.env.MONGO_COLLECTION_POST_HTML;

  let currentUrl = startUrl;
  let requests = 0;

  let batchStartTime = Date.now();
  const startTime = batchStartTime;

  try {
    const lightCollection = await mongoDbDatabase.collection(
      MONGO_COLLECTION_LIGHT_DATA
    );
    const postHtmlCollection = await mongoDbDatabase.collection(
      MONGO_COLLECTION_POST_HTML
    );

    while (currentUrl != null) {
      if (requests > 0 && requests % 7 === 0) {
        // we make 2 requests per api call, and are alotted 15 api calls per minute.
        // every 7*2 = 14 api calls, pause for 60 seconds

        // the gemini api tracking website says that I use ~7.9 api calls per minute
        // I should be able to wait only 31.6, or maybe 40 seconds. This would reduce time
        // by > 30%
        await sleep(1000 * 60);
        batchStartTime = Date.now();
      }
      requests++;
      const timeString = new Date(Date.now() - startTime).toLocaleTimeString(
        "en-US",
        { hour12: false }
      );
      // the next url is returned
      currentUrl = await scrapeDataFromPage(
        page,
        currentUrl,
        lightCollection,
        postHtmlCollection
      );
    }
  } catch (error) {
    console.error("Error during scraping:", error);
  } finally {
    const pages = await browser.pages();
    for (const page of pages) {
      await page.close();
    }
    await browser.close();
  }
}

async function scrapeNewBlogPosts() {
  const DATABASE_NAME = process.env.MONGO_COLLECTION_LIGHT_DATA;

  try {
    const database = await getDatabase();

    const collection = await database.collection(DATABASE_NAME);
    const data = await collection.find().toArray();
    data.sort((a, b) => {
      const bDate = new Date(b.date.upload_date);
      const aDate = new Date(a.date.upload_date);
      return bDate.getTime() - aDate.getTime();
    });

    // first item in the array (data) is the most recent item
    const urlOfLatestPost = data.at(0).url;
    await scrapeBlogPosts(urlOfLatestPost, database);
  } catch (error) {
    console.error("failed to connect to mongoDB: ", error);
  } finally {
    await closeDatabase();
    // process.exit(0);
  }
}

await scrapeNewBlogPosts();
