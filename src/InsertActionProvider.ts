import { CodeActionProvider, CodeActionKind, Range, CodeAction, TextDocument, DocumentFilter, CodeActionContext, Diagnostic, window, Position } from "vscode";
import { I18nConfig, I18nFunction } from "./i18n.interfaces";

export interface InsertActionProviderDelegate {
    readConfigFileAsync(): Promise<I18nConfig>;
    readI18nFileAsync(locale: string): Promise<{ [id: string]: any }>;
    writeI18nFileAsync(locale: string, i18n: any): Promise<void>;
    buildFunction(name: string, value: string): I18nFunction;
    generateUpdateAsync(): Promise<void>;
}

interface CommandInput {
    name: string;
    range: Range;
}

export class InsertActionProvider implements CodeActionProvider {
    readonly actionName = "flutterI18nInsert";
    readonly delegate: InsertActionProviderDelegate;
    readonly filter: DocumentFilter = { language: "dart", scheme: "file" };
    readonly regex = RegExp('^The getter \'(.*)\' isn\'t defined for the class \'I18n\'.');

    constructor(delegate: InsertActionProviderDelegate) {
        this.delegate = delegate;
    }

    extractName(context: CodeActionContext): [string, Diagnostic] | null {
        for (let obj of context.diagnostics) {
            if (obj.code === "undefined_getter") {
                let result = this.regex.exec(obj.message);
                if (result && result.length === 2) {
                    return [result[1], obj];
                }
            }
        }
        return null;
    }
    provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext): CodeAction[] {
        let result = this.extractName(context);
        if (result) {
            let action = new CodeAction("I18n: add localization string", CodeActionKind.QuickFix);
            let input: CommandInput = {
                name: result[0],
                range: range
            };

            action.command = {
                title: action.title,
                command: this.actionName,
                arguments: [
                    input
                ]
            };
            action.diagnostics = [result[1]];
            action.isPreferred = true;
            return [action];
        }
        return [];
    }

    async insertAsync(input: CommandInput): Promise<void> {
        try {
            await this.insertAsyncThrowing(input);
        } catch (error) {
            console.log(error);
            window.showErrorMessage(error.message);
        }
    }

    async addEntryToDefaultLocale(key: string, value: string): Promise<void> {
        const config = await this.delegate.readConfigFileAsync();
        const locale = config.defaultLocale || "";

        const defaultI18n = await this.delegate.readI18nFileAsync(locale);

        if (defaultI18n.hasOwnProperty(key)) {
            window.showInformationMessage(`Key ${key} already exists.`);
            return;
        }

        defaultI18n[key] = value;
        await this.delegate.writeI18nFileAsync(locale, defaultI18n);
    }

    async insertAsyncThrowing(input: CommandInput): Promise<void> {
        let key = input.name;

        let value = await window.showInputBox({
            prompt: "Please enter key for the new localization value",
            placeHolder: "Value"
        });

        if (!key || !value) {
            window.showInformationMessage(`Adding key was cancelled.`);
            return;
        }

        await this.addEntryToDefaultLocale(key, value);

        let generated = this.delegate.buildFunction(key, value);
        if (generated.variables) {
            let joined = generated.variables.join(', ');
            let methodCall = "(" + joined + ")";

            window.activeTextEditor!.edit((x) => {
                x.insert(input.range.end, methodCall);
            });
        }

        await this.delegate.generateUpdateAsync();
    }
}
