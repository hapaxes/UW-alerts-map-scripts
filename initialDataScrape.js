import puppeteer from "puppeteer";
import {
  run,
  extractLocationPrompt,
  extractCategoriesPrompt,
} from "./gemini.cjs";
import { getGeocodeFromLocation } from "./googleMapsApi.cjs";
import fs from "fs";
import { promisify } from "util";

const sleep = promisify(setTimeout);

async function getPostText(page, articleID) {
  const articleText = await page.evaluate((id) => {
    const article = document.querySelector(`article.${id}`);

    if (article) {
      return article.innerText;
    }

    return null;
  }, articleID);

  return articleText;
}

async function getDataFromPost(page) {
  const obj = await page.evaluate(() => {
    // post_id
    const postElement = document.querySelector('article[id^="post-"]');
    const post_id = postElement.id;

    // title
    const titleElement = document.querySelector("h1.entry-title");
    const title = titleElement?.textContent.trim();

    // headerHTML
    const headerElement = document.querySelector(".entry-header");
    const headerHTML = headerElement?.outerHTML;

    // content HTML
    const contentElement = document.querySelector(".entry-content");
    const contentHTML = contentElement?.outerHTML;

    // set each <a> tag to open in a new page (target="_blank")
    if (contentElement) {
      const links = contentElement.querySelectorAll("a");

      links.forEach((link) => {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      });
    }

    // upload_date
    const uploadTimeElement = document.querySelector(
      "time.entry-date.published"
    );
    const upload_date = uploadTimeElement?.dateTime;

    // update_date (if exists)
    const updateTimeElement = document.querySelector("time.updated");
    const update_date = updateTimeElement ? updateTimeElement.dateTime : null;

    // url
    const urlElement = document.querySelector("span.posted-on a");
    const url = urlElement.href;

    const obj = {
      post_id,
      url,
      post: { title, headerHTML, contentHTML },
      date: { upload_date, update_date },
    };

    return obj;
  });

  return obj;
}

function extractLightData(obj) {
  const lightObj = {
    post_id: obj.post_id,
    url: obj.url,
    title: obj.post?.title,
    date: obj.date,
    categories: [...obj.categories],
  };

  if (obj.location) {
    lightObj.location = obj.location;
  }

  return lightObj;
}

function extractHeavyData(obj) {
  const heavyObj = {
    post_id: obj.post_id,
    contentHTML: obj.post.contentHTML,
    date: obj.date,
    title: obj.post.title,
    url: obj.url,
  };

  return heavyObj;
}

async function scrapeFromPage(page, currentUrl, postCount) {
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

    console.log(postCount, " // ", obj.post.title);

    fs.appendFileSync(
      "post_summary1.txt",
      "\n\n" + JSON.stringify(lightData),
      "utf8"
    );
    fs.appendFileSync(
      "post_html_content1.txt",
      "\n\n" + JSON.stringify(heavyData),
      "utf8"
    );

    // Check if the "nav-previous" button exists
    const previousButtonExists = await page.evaluate(() => {
      return !!document.querySelector("div.nav-previous a");
    });

    if (previousButtonExists) {
      // Click the "nav-previous" button
      await page.evaluate(() => {
        const navPreviousDiv = document.querySelector("div.nav-previous");
        if (navPreviousDiv) {
          const firstLink = navPreviousDiv.querySelector("a");
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
    throw new Error(e);
    console.log(e.message);
  }
}

async function scrapeBlogPosts(startUrl) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  let currentUrl = startUrl;
  let requests = 0;

  let batchStartTime = Date.now();
  const startTime = batchStartTime;

  try {
    while (currentUrl) {
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
      console.log(timeString);
      // the next url is returned
      currentUrl = await scrapeFromPage(page, currentUrl, requests);
      console.log();
    }
  } catch (error) {
    console.error("Error during scraping:", error);
  } finally {
    await browser.close();
  }
}

export { getPostText, extractLightData, extractHeavyData, getDataFromPost };
// scrapeBlogPosts(
//   "https://emergency.uw.edu/2025/02/26/shooting-at-ne-47th-st-u-way-ne/"
// );
