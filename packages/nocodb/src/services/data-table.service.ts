import { Injectable } from '@nestjs/common';
import { RelationTypes, UITypes } from 'nocodb-sdk';
import { NcError } from '../helpers/catchError';
import { PagedResponseImpl } from '../helpers/PagedResponse';
import { Base, Column, Model, View } from '../models';
import {
  getColumnByIdOrName,
  getViewAndModelByAliasOrId,
  PathParams,
} from '../modules/datas/helpers';
import NcConnectionMgrv2 from '../utils/common/NcConnectionMgrv2';
import { DatasService } from './datas.service';
import type { LinkToAnotherRecordColumn } from '../models';

@Injectable()
export class DataTableService {
  constructor(private datasService: DatasService) {}

  async dataList(param: {
    projectId?: string;
    modelId: string;
    query: any;
    viewId?: string;
  }) {
    const { model, view } = await this.getModelAndView(param);

    return await this.datasService.getDataList({
      model,
      view,
      query: param.query,
    });
  }

  async dataRead(param: {
    projectId?: string;
    modelId: string;
    rowId: string;
    viewId?: string;
    query: any;
  }) {
    const { model, view } = await this.getModelAndView(param);

    const base = await Base.get(model.base_id);

    const baseModel = await Model.getBaseModelSQL({
      id: model.id,
      viewId: view?.id,
      dbDriver: await NcConnectionMgrv2.get(base),
    });

    const row = await baseModel.readByPk(param.rowId, false, param.query);

    if (!row) {
      NcError.notFound('Row not found');
    }

    return row;
  }

  async dataInsert(param: {
    projectId?: string;
    viewId?: string;
    modelId: string;
    body: any;
    cookie: any;
  }) {
    const { model, view } = await this.getModelAndView(param);
    const base = await Base.get(model.base_id);

    const baseModel = await Model.getBaseModelSQL({
      id: model.id,
      viewId: view?.id,
      dbDriver: await NcConnectionMgrv2.get(base),
    });

    // if array then do bulk insert
    const result = await baseModel.bulkInsert(
      Array.isArray(param.body) ? param.body : [param.body],
      { cookie: param.cookie, insertOneByOneAsFallback: true },
    );

    return Array.isArray(param.body) ? result : result[0];
  }

  async dataUpdate(param: {
    projectId?: string;
    modelId: string;
    viewId?: string;
    // rowId: string;
    body: any;
    cookie: any;
  }) {
    const { model, view } = await this.getModelAndView(param);

    await this.checkForDuplicateRow({ rows: param.body, model });

    const base = await Base.get(model.base_id);

    const baseModel = await Model.getBaseModelSQL({
      id: model.id,
      viewId: view?.id,
      dbDriver: await NcConnectionMgrv2.get(base),
    });

    const res = await baseModel.bulkUpdate(
      Array.isArray(param.body) ? param.body : [param.body],
      { cookie: param.cookie, throwExceptionIfNotExist: true },
    );

    return this.extractIdObj({ body: param.body, model });
  }

  async dataDelete(param: {
    projectId?: string;
    modelId: string;
    viewId?: string;
    // rowId: string;
    cookie: any;
    body: any;
  }) {
    const { model, view } = await this.getModelAndView(param);

    await this.checkForDuplicateRow({ rows: param.body, model });

    const base = await Base.get(model.base_id);
    const baseModel = await Model.getBaseModelSQL({
      id: model.id,
      viewId: view?.id,
      dbDriver: await NcConnectionMgrv2.get(base),
    });

    await baseModel.bulkDelete(
      Array.isArray(param.body) ? param.body : [param.body],
      { cookie: param.cookie, throwExceptionIfNotExist: true },
    );

    return this.extractIdObj({ body: param.body, model });
  }

  async dataCount(param: {
    projectId?: string;
    viewId?: string;
    modelId: string;
    query: any;
  }) {
    const { model, view } = await this.getModelAndView(param);

    const base = await Base.get(model.base_id);

    const baseModel = await Model.getBaseModelSQL({
      id: model.id,
      viewId: view?.id,
      dbDriver: await NcConnectionMgrv2.get(base),
    });

    const countArgs: any = { ...param.query };
    try {
      countArgs.filterArr = JSON.parse(countArgs.filterArrJson);
    } catch (e) {}

    const count: number = await baseModel.count(countArgs);

    return { count };
  }

  private async getModelAndView(param: {
    projectId?: string;
    viewId?: string;
    modelId: string;
  }) {
    const model = await Model.get(param.modelId);

    if (!model) {
      NcError.notFound(`Table '${param.modelId}' not found`);
    }

    if (param.projectId && model.project_id !== param.projectId) {
      throw new Error('Model not belong to project');
    }

    let view: View;

    if (param.viewId) {
      view = await View.get(param.viewId);
      if (!view || (view.fk_model_id && view.fk_model_id !== param.modelId)) {
        NcError.unprocessableEntity(`View '${param.viewId}' not found`);
      }
    }

    return { model, view };
  }

  private async extractIdObj({
    model,
    body,
  }: {
    body: Record<string, any> | Record<string, any>[];
    model: Model;
  }) {
    const pkColumns = await model
      .getColumns()
      .then((cols) => cols.filter((col) => col.pk));

    const result = (Array.isArray(body) ? body : [body]).map((row) => {
      return pkColumns.reduce((acc, col) => {
        acc[col.title] = row[col.title];
        return acc;
      }, {});
    });

    return Array.isArray(body) ? result : result[0];
  }

  private async checkForDuplicateRow({
    rows,
    model,
  }: {
    rows: any[] | any;
    model: Model;
  }) {
    if (!rows || !Array.isArray(rows) || rows.length === 1) {
      return;
    }

    await model.getColumns();

    const keys = new Set();

    for (const row of rows) {
      let pk;
      // if only one primary key then extract the value
      if (model.primaryKeys.length === 1) pk = row[model.primaryKey.title];
      // if composite primary key then join the values with ___
      else pk = model.primaryKeys.map((pk) => row[pk.title]).join('___');
      // if duplicate then throw error
      if (keys.has(pk)) {
        NcError.unprocessableEntity('Duplicate row with id ' + pk);
      }
      keys.add(pk);
    }
  }

  async nestedDataList(param: {
    viewId: string;
    modelId: string;
    query: any;
    rowId: string | string[] | number | number[];
    columnId: string;
  }) {
    const { model, view } = await this.getModelAndView(param);
    const base = await Base.get(model.base_id);

    const baseModel = await Model.getBaseModelSQL({
      id: model.id,
      viewId: view?.id,
      dbDriver: await NcConnectionMgrv2.get(base),
    });
    const column = await this.getColumn(param);

    const colOptions = await column.getColOptions<LinkToAnotherRecordColumn>();

    let data: any[];
    let count: number;
    if (colOptions.type === RelationTypes.MANY_TO_MANY) {
      data = await baseModel.mmList(
        {
          colId: column.id,
          parentId: param.rowId,
        },
        param.query as any,
      );
      count = (await baseModel.mmListCount({
        colId: column.id,
        parentId: param.rowId,
      })) as number;
    } else {
      data = await baseModel.hmList(
        {
          colId: column.id,
          id: param.rowId,
        },
        param.query as any,
      );
      count = (await baseModel.hmListCount({
        colId: column.id,
        id: param.rowId,
      })) as number;
    }
    return new PagedResponseImpl(data, {
      count,
      ...param.query,
    });
  }

  private async getColumn(param: { modelId: string; columnId: string }) {
    const column = await Column.get({ colId: param.columnId });

    if (!column) NcError.badRequest('Column not found');

    if (column.fk_model_id !== param.modelId)
      NcError.badRequest('Column not belong to model');

    if (column.uidt !== UITypes.LinkToAnotherRecord)
      NcError.badRequest('Column is not LTAR');
    return column;
  }

  async nestedLink(param: {
    cookie: any;
    viewId: string;
    modelId: string;
    columnId: string;
    query: any;
    refRowIds: string | string[] | number | number[];
    rowId: string;
  }) {
    const { model, view } = await this.getModelAndView(param);
    if (!model) NcError.notFound('Table not found');

    const base = await Base.get(model.base_id);

    const baseModel = await Model.getBaseModelSQL({
      id: model.id,
      viewId: view?.id,
      dbDriver: await NcConnectionMgrv2.get(base),
    });

    const column = await this.getColumn(param);

    await baseModel.addLinks({
      colId: column.id,
      childIds: Array.isArray(param.refRowIds)
        ? param.refRowIds
        : [param.refRowIds],
      rowId: param.rowId,
      cookie: param.cookie,
    });

    return true;
  }

  async nestedUnlink(param: {
    cookie: any;
    viewId: string;
    modelId: string;
    columnId: string;
    query: any;
    refRowIds: string | string[] | number | number[];
    rowId: string;
  }) {
    const { model, view } = await this.getModelAndView(param);
    if (!model) NcError.notFound('Table not found');

    const base = await Base.get(model.base_id);

    const baseModel = await Model.getBaseModelSQL({
      id: model.id,
      viewId: view?.id,
      dbDriver: await NcConnectionMgrv2.get(base),
    });

    const column = await this.getColumn(param);

    await baseModel.removeLinks({
      colId: column.id,
      childIds: Array.isArray(param.refRowIds)
        ? param.refRowIds
        : [param.refRowIds],
      rowId: param.rowId,
      cookie: param.cookie,
    });

    return true;
  }
}
