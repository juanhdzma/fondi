import * as React from 'react';
import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react';
import { AlertDialog as Primitive } from 'radix-ui';

type RootProps = React.ComponentProps<typeof Primitive.Root>;
type ContextValue = { isOpen: boolean; setIsOpen: NonNullable<RootProps['onOpenChange']> };

const Context = React.createContext<ContextValue | undefined>(undefined);

function useAlertDialog() {
  const value = React.useContext(Context);
  if (!value) throw new Error('AlertDialog components must be inside AlertDialog');
  return value;
}

function AlertDialog({ open, defaultOpen, onOpenChange, ...props }: RootProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const isOpen = open ?? internalOpen;
  const setIsOpen = React.useCallback((next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange, open]);

  return (
    <Context.Provider value={{ isOpen, setIsOpen }}>
      <Primitive.Root {...props} open={isOpen} onOpenChange={setIsOpen} />
    </Context.Provider>
  );
}

const AlertDialogTrigger = Primitive.Trigger;
const AlertDialogCancel = Primitive.Cancel;
const AlertDialogAction = Primitive.Action;
const AlertDialogTitle = Primitive.Title;
const AlertDialogDescription = Primitive.Description;

function AlertDialogPortal(props: Omit<React.ComponentProps<typeof Primitive.Portal>, 'forceMount'>) {
  const { isOpen } = useAlertDialog();
  return <AnimatePresence>{isOpen && <Primitive.Portal forceMount {...props} />}</AnimatePresence>;
}

type OverlayProps = Omit<React.ComponentProps<typeof Primitive.Overlay>, 'forceMount' | 'asChild'> & HTMLMotionProps<'div'>;

function AlertDialogOverlay({ transition = { duration: 0.2, ease: 'easeInOut' }, ...props }: OverlayProps) {
  return (
    <Primitive.Overlay asChild forceMount>
      <motion.div
        key="alert-dialog-overlay"
        initial={{ opacity: 0, filter: 'blur(4px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, filter: 'blur(4px)' }}
        transition={transition}
        {...props}
      />
    </Primitive.Overlay>
  );
}

type ContentProps = Omit<React.ComponentProps<typeof Primitive.Content>, 'forceMount' | 'asChild'> & HTMLMotionProps<'div'> & {
  from?: 'top' | 'bottom' | 'left' | 'right';
};

function AlertDialogContent({ from = 'top', transition = { type: 'spring', stiffness: 150, damping: 25 }, ...props }: ContentProps) {
  const initialRotation = from === 'bottom' || from === 'left' ? '20deg' : '-20deg';
  const rotateAxis = from === 'top' || from === 'bottom' ? 'rotateX' : 'rotateY';

  return (
    <Primitive.Content asChild forceMount>
      <motion.div
        key="alert-dialog-content"
        initial={{ opacity: 0, filter: 'blur(4px)', transform: `translate(-50%, -50%) perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)` }}
        animate={{ opacity: 1, filter: 'blur(0px)', transform: `translate(-50%, -50%) perspective(500px) ${rotateAxis}(0deg) scale(1)` }}
        exit={{ opacity: 0, filter: 'blur(4px)', transform: `translate(-50%, -50%) perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)` }}
        transition={transition}
        {...props}
      />
    </Primitive.Content>
  );
}

const AlertDialogHeader = (props: React.ComponentProps<'div'>) => <div {...props} />;
const AlertDialogFooter = (props: React.ComponentProps<'div'>) => <div {...props} />;

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
