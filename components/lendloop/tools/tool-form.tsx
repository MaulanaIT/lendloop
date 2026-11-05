"use client";

import { useMutation } from "convex/react";
import { ChevronDown, Eye, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { useOffline } from "@/components/lendloop/banners";
import { Button } from "@/components/ui/button";
import { Field, FieldCounter, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { OFFLINE_ACTION_REASON, TOAST_COPY } from "@/lib/copy";
import type { Availability } from "@/lib/domain/availability";
import { CONDITION_META, TOOL_LIMITS, type Category, type Condition } from "@/lib/domain/categories";
import { parseAppError } from "@/lib/domain/errors";
import { toast, toastAppError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CategorySelect } from "./category-select";
import { ConditionRadio } from "./condition-radio";
import { ToolCardPreview } from "./tool-card-preview";

export type ToolFormValues = {
  name: string;
  category: Category | null;
  condition: Condition | null;
  description: string;
};

type FieldKey = keyof ToolFormValues;
const FIELD_ORDER: FieldKey[] = ["name", "category", "condition", "description"];

/** Same limits the Convex validator enforces (TOOL_LIMITS); the server re-checks on every save. */
function validate(v: ToolFormValues): Record<FieldKey, string | null> {
  const n = v.name.trim().length;
  const d = v.description.trim().length;
  const { name, description } = TOOL_LIMITS;
  return {
    name: n < name.min || n > name.max ? `Give your tool a name (${name.min}–${name.max} characters).` : null,
    category: v.category ? null : "Pick a category.",
    condition: v.condition ? null : "Pick a condition.",
    description:
      d < description.min || d > description.max
        ? `Describe it in ${description.min}–${description.max} characters.`
        : null,
  };
}

/** aria-describedby from optional ids. */
function describe(...ids: (string | false | null | undefined)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

function isFieldKey(v: unknown): v is FieldKey {
  return typeof v === "string" && (FIELD_ORDER as string[]).includes(v);
}

type CommonProps = {
  viewerInitials: string;
  /** Pill shown on the preview card (defaults to "Available"). */
  previewAvailability?: Availability;
};

export type ToolFormProps = CommonProps &
  (
    | { mode: "new"; initial?: undefined; toolId?: undefined }
    | { mode: "edit"; initial: ToolFormValues; toolId: Id<"tools"> }
  );

const EMPTY: ToolFormValues = { name: "", category: null, condition: null, description: "" };
const AVAILABLE: Availability = { kind: "available" };

/**
 * List / edit form (brief B5): validation on blur and submit, focus to the
 * first invalid field, server VALIDATION errors mapped back onto fields, a
 * live card preview (desktop side column, mobile accordion).
 */
export function ToolForm({ mode, initial, toolId, viewerInitials, previewAvailability = AVAILABLE }: ToolFormProps) {
  const router = useRouter();
  const offline = useOffline();
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const isEdit = mode === "edit";

  const [values, setValues] = useState<ToolFormValues>(initial ?? EMPTY);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [liveMsg, setLiveMsg] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLButtonElement>(null);
  const conditionRef = useRef<{ focus: () => void }>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    nameCount: `${uid}-name-count`,
    nameErr: `${uid}-name-err`,
    catLabel: `${uid}-cat-l`,
    cat: `${uid}-cat`,
    catErr: `${uid}-cat-err`,
    condLabel: `${uid}-cond-l`,
    condHelp: `${uid}-cond-help`,
    condErr: `${uid}-cond-err`,
    desc: `${uid}-desc`,
    descCount: `${uid}-desc-count`,
    descHint: `${uid}-desc-hint`,
    descErr: `${uid}-desc-err`,
    preview: `${uid}-preview`,
  };

  const errors = validate(values);
  const shown = (k: FieldKey) => serverErrors[k] ?? (touched[k] ? errors[k] : null);
  const touch = (k: FieldKey) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const set = <K extends FieldKey>(k: K, v: ToolFormValues[K]) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    setServerErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };

  const focusField = (k: FieldKey) => {
    const target = { name: nameRef, category: categoryRef, condition: conditionRef, description: descriptionRef }[k];
    // After the error re-render, so screen readers hear the field with its message.
    window.setTimeout(() => target.current?.focus(), 0);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving || offline) return;
    const firstBad = FIELD_ORDER.find((k) => errors[k]);
    if (firstBad) {
      setTouched({ name: true, category: true, condition: true, description: true });
      setLiveMsg("Fix the highlighted fields.");
      focusField(firstBad);
      return;
    }
    const input = {
      name: values.name.trim(),
      category: values.category!,
      condition: values.condition!,
      description: values.description.trim(),
    };
    setSaving(true);
    setLiveMsg(isEdit ? "Saving…" : "Publishing…");
    try {
      // ownerId is never sent: Convex takes it from the signed-in identity, and update re-checks ownership.
      const id = isEdit ? (await update({ toolId, ...input }), toolId) : await create(input);
      toast.success(isEdit ? "Changes saved." : TOAST_COPY.listed);
      router.push(`/tools/${id}`);
    } catch (err) {
      setSaving(false);
      setLiveMsg("");
      const parsed = parseAppError(err);
      if (parsed.code === "VALIDATION" && isFieldKey(parsed.field)) {
        setServerErrors({ [parsed.field]: parsed.copy });
        focusField(parsed.field);
      } else if (parsed.code === "UNKNOWN") {
        toast.error(isEdit ? "Couldn't save your changes" : "Couldn't publish your listing", {
          description: "Your changes are kept. Check your connection and try again.",
          onRetry: () => formRef.current?.requestSubmit(),
        });
      } else {
        toastAppError(err);
      }
    }
  };

  const nameErr = shown("name");
  const catErr = shown("category");
  const condErr = shown("condition");
  const descErr = shown("description");
  const cond = values.condition ? CONDITION_META[values.condition] : null;
  const cancelHref = isEdit ? `/tools/${toolId}` : "/tools";
  const preview = (
    <ToolCardPreview
      name={values.name}
      category={values.category}
      condition={values.condition}
      description={values.description}
      availability={previewAvailability}
      viewerInitials={viewerInitials}
    />
  );

  return (
    <div className="grid items-start gap-[clamp(24px,5vw,64px)] min-[960px]:grid-cols-[minmax(0,560px)_minmax(280px,340px)]">
      <form
        ref={formRef}
        noValidate
        aria-labelledby="form-h"
        onSubmit={submit}
        className="flex min-w-0 max-w-[560px] flex-col gap-6"
      >
        <p className="m-0 text-[13px] text-muted-foreground">All fields are required.</p>
        <fieldset
          disabled={saving}
          className={cn(
            "m-0 flex min-w-0 flex-col gap-6 border-0 p-0 transition-opacity duration-150",
            saving && "opacity-60",
          )}
        >
          <Field>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={ids.name}>Name</Label>
              <FieldCounter id={ids.nameCount} value={values.name.length} max={TOOL_LIMITS.name.max} />
            </div>
            <Input
              ref={nameRef}
              id={ids.name}
              autoComplete="off"
              placeholder="e.g. Bosch cordless drill"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              onBlur={() => touch("name")}
              aria-required
              aria-invalid={!!nameErr || undefined}
              aria-describedby={describe(nameErr && ids.nameErr, ids.nameCount)}
            />
            <FieldError id={ids.nameErr}>{nameErr}</FieldError>
          </Field>

          <Field>
            <span id={ids.catLabel} className="font-semibold">
              Category
            </span>
            <CategorySelect
              ref={categoryRef}
              id={ids.cat}
              labelId={ids.catLabel}
              value={values.category}
              onChange={(c) => {
                set("category", c);
                touch("category");
              }}
              onClose={() => touch("category")}
              invalid={!!catErr}
              describedBy={catErr ? ids.catErr : undefined}
              disabled={saving}
            />
            <FieldError id={ids.catErr}>{catErr}</FieldError>
          </Field>

          <Field className="gap-2">
            <span id={ids.condLabel} className="font-semibold">
              Condition
            </span>
            <ConditionRadio
              ref={conditionRef}
              labelId={ids.condLabel}
              value={values.condition}
              onChange={(c) => {
                set("condition", c);
                touch("condition");
              }}
              onBlur={() => touch("condition")}
              invalid={!!condErr}
              describedBy={describe(ids.condHelp, condErr && ids.condErr)}
            />
            <p id={ids.condHelp} className="m-0 text-muted-foreground">
              {cond ? (
                <>
                  <span className="font-medium text-foreground">{cond.label}</span> — {cond.helper}
                </>
              ) : (
                "Pick the option that fits best."
              )}
            </p>
            <FieldError id={ids.condErr}>{condErr}</FieldError>
          </Field>

          <Field>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={ids.desc}>Short description</Label>
              <FieldCounter
                id={ids.descCount}
                value={values.description.length}
                max={TOOL_LIMITS.description.max}
              />
            </div>
            <Textarea
              ref={descriptionRef}
              id={ids.desc}
              rows={4}
              placeholder="What's included, and anything a borrower should know."
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              onBlur={() => touch("description")}
              aria-required
              aria-invalid={!!descErr || undefined}
              aria-describedby={describe(descErr && ids.descErr, ids.descHint, ids.descCount)}
              className="min-h-28"
            />
            <p id={ids.descHint} className="m-0 flex items-start gap-1.5 text-[13px] text-muted-foreground text-pretty">
              <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
              Don&apos;t include your address or phone number. Contact is shared only after you approve a request.
            </p>
            <FieldError id={ids.descErr}>{descErr}</FieldError>
          </Field>
        </fieldset>

        {/* Below 960px the preview collapses into an accordion above the buttons. */}
        <div className="rounded-lg border border-border bg-card min-[960px]:hidden">
          <button
            type="button"
            aria-expanded={previewOpen}
            aria-controls={ids.preview}
            onClick={() => setPreviewOpen((o) => !o)}
            className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-4 text-left font-semibold"
          >
            <span className="inline-flex items-center gap-2">
              <Eye aria-hidden className="size-4" />
              Preview
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-5 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                previewOpen && "rotate-180",
              )}
            />
          </button>
          {previewOpen ? (
            <div id={ids.preview} className="px-3 pb-3">
              {preview}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-2">
          <Button
            type="submit"
            size="lg"
            className="flex-1 md:flex-none"
            loading={saving}
            loadingLabel={isEdit ? "Saving…" : "Publishing…"}
            disabledReason={offline ? OFFLINE_ACTION_REASON : null}
          >
            {isEdit ? "Save changes" : "Publish listing"}
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className={cn("flex-1 px-[18px] md:flex-none", saving && "pointer-events-none opacity-60")}
          >
            <Link href={cancelHref} aria-disabled={saving || undefined} tabIndex={saving ? -1 : undefined}>
              Cancel
            </Link>
          </Button>
        </div>
        <span role="status" aria-live="polite" className="sr-only">
          {liveMsg}
        </span>
      </form>

      <aside aria-label="Preview" className="sticky top-[88px] hidden flex-col gap-2.5 min-[960px]:flex">
        <p className="m-0 flex items-center gap-2 font-semibold">
          <Eye aria-hidden className="size-4" />
          Preview
        </p>
        {preview}
        <p className="m-0 text-[13px] text-muted-foreground">This is how neighbors see it on Browse.</p>
      </aside>
    </div>
  );
}
