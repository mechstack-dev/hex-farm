from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_frontend(page: Page):
    # Wait for the client to be ready
    for i in range(10):
        try:
            page.goto("http://localhost:5173")
            break
        except:
            time.sleep(2)

    # Enter name and join
    page.get_by_placeholder("Enter your name").fill("TestPlayer")
    page.get_by_role("button", name="Join Game").click()

    # Wait for the game to load
    expect(page.get_by_text("Harvest Hex MMO")).to_be_visible()

    # Take a screenshot
    time.sleep(5) # Allow some time for entities to render
    page.screenshot(path="verification/verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_frontend(page)
        finally:
            browser.close()
