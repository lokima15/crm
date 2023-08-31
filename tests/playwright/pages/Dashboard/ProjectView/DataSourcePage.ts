import BasePage from '../../Base';
import { ProjectViewPage } from './index';
import { Locator } from '@playwright/test';
import { MetaDataPage } from './Metadata';

export class DataSourcePage extends BasePage {
  readonly projectView: ProjectViewPage;
  readonly databaseType: Locator;
  readonly metaData: MetaDataPage;

  constructor(projectView: ProjectViewPage) {
    super(projectView.rootPage);
    this.projectView = projectView;
    this.databaseType = this.get().locator('.nc-extdb-db-type');
    this.metaData = new MetaDataPage(this);
  }

  get() {
    return this.rootPage.locator('.nc-data-sources-view');
  }

  async getDatabaseTypeList() {
    await this.databaseType.click();
    const nodes = await this.rootPage.locator('.nc-dropdown-ext-db-type').locator('.ant-select-item');
    const list = [];
    for (let i = 0; i < (await nodes.count()); i++) {
      const node = nodes.nth(i);
      const text = await node.textContent();
      list.push(text);
    }
    return list;
  }

  async openMetaSync({ rowIndex }: { rowIndex: number }) {
    // 0th offset for header
    const row = this.get()
      .locator('.ds-table-row')
      .nth(rowIndex + 1);
    await row.locator('button.nc-action-btn:has-text("Sync Metadata")').click();
  }

  async openERD({ rowIndex }: { rowIndex: number }) {
    // hardwired
    // await this.rootPage.locator('button.nc-action-btn:has-text("Relations")').click();

    // 0th offset for header
    const row = this.get()
      .locator('.ds-table-row')
      .nth(rowIndex + 1);
    await row.locator('button.nc-action-btn:has-text("Relations")').click();
  }
}
