import asyncio
from playwright.async_api import async_playwright
import os

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Connect to the game
        await page.goto("http://localhost:3001")
        await page.fill("input[placeholder='Enter your name']", "Tester")
        await page.click("button:has-text('Join Game')")

        # Wait for joining
        await page.wait_for_selector("text=Welcome to HexFarm")

        # Move to merchant (0,0) - we start at 0,0 usually but let's make sure
        # Press 'N' to try and build beehive (should fail due to resources)
        await page.keyboard.press("n")
        await page.wait_for_selector(".notification.error", timeout=10000)

        # Interact with Merchant (should be at 0,0)
        # Try 'E' to interact
        await page.keyboard.press("e")

        # Take a screenshot
        os.makedirs("verification/screenshots", exist_ok=True)
        await page.screenshot(path="verification/screenshots/final_verification.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify())
