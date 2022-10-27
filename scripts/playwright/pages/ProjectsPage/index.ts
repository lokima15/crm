// playwright-dev-page.ts
import { expect, Page } from "@playwright/test";
import BasePage from "../Base";

export class ProjectsPage extends BasePage {
  constructor(rootPage: Page) {
    super(rootPage);
  }

  prefixTitle(title: string) {
    const parallelId = process.env.TEST_PARALLEL_INDEX ?? '0'
    return `${title}${parallelId}`;
  }

  get() {
    return this.rootPage.locator("html");
  }

  // create project
  async createProject({
    name = "sample",
    type = "xcdb",
    withoutPrefix,
  }: {
    name?: string;
    type?: string;
    withoutPrefix?: boolean;
  }) {
    if(!withoutPrefix) name = this.prefixTitle(name);
    // fix me! wait for page to be rendered completely
    await this.rootPage.waitForTimeout(1000);
    await this.rootPage.locator(".nc-new-project-menu").click();

    const createProjectMenu = await this.rootPage.locator(
      ".nc-dropdown-create-project"
    );
    if (type === "xcdb") {
      await createProjectMenu
        .locator(`.ant-dropdown-menu-title-content`)
        .nth(0)
        .click();
    } else {
      await createProjectMenu
        .locator(`.ant-dropdown-menu-title-content`)
        .nth(1)
        .click();
    }

    await this.rootPage.locator(`.nc-metadb-project-name`).waitFor();
    await this.rootPage.locator(`input.nc-metadb-project-name`).fill(name);
    await this.rootPage.locator(`input.nc-metadb-project-name`).press("Enter");

    // fix me! wait for page to be rendered completely
    await this.rootPage.waitForTimeout(2000);
  }

  async openProject({title, withoutPrefix}: {title: string, withoutPrefix?: boolean}) {
    if(!withoutPrefix) title = this.prefixTitle(title);

    let project: any;

    await Promise.all([
      this.rootPage.waitForResponse(async (res) => {
        let json:any = {}
        try{
          json = await res.json()
        } catch(e) {
          return false;
        }

        const isRequiredResponse = res.request().url().includes('/api/v1/db/meta/projects') &&
        ['GET'].includes(res.request().method()) &&
        json?.title === title;

        if(isRequiredResponse){
          project = json;
        }

        return isRequiredResponse;
      }),
      this.get().locator(`.ant-table-cell`,{
        hasText: title
      }).click()
    ]);

    return project;
  }

  async deleteProject({title, withoutPrefix}: {title: string, withoutPrefix?: boolean}) {
    if(!withoutPrefix) title = this.prefixTitle(title);

    await this.get().locator(`[pw-data="delete-project-${title}"]`).click();
    await this.rootPage.locator(`button:has-text("Yes")`).click();

    await expect.poll(
      async () => await this.get().locator(`[pw-data="delete-project-${title}"]`).count()
    ).toBe(0);
  }


  async renameProject({
    title,
    newTitle,
    withoutPrefix,
  }: {
    title: string;
    newTitle: string;
    withoutPrefix?: boolean;
  }) {
    if(!withoutPrefix) title = this.prefixTitle(title);
    if(!withoutPrefix) newTitle = this.prefixTitle(newTitle);

    const project = this.rootPage;
    const projRow = await project.locator(`tr`, {
      has: project.locator(`td.ant-table-cell:has-text("${title}")`),
    });
    await projRow.locator(".nc-action-btn").nth(0).click();
    await project.locator("input.nc-metadb-project-name").fill(newTitle);
    // press enter to save
    await project.locator("input.nc-metadb-project-name").press("Enter");
  }
}
