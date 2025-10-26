import {
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { MoveSummary } from '@hooks/useSantorini';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: MoveSummary[];
  jumpToMove: (index: number) => Promise<void>;
}

function HistoryModal({ isOpen, onClose, history, jumpToMove }: HistoryModalProps) {
  const handleJump = async (index: number) => {
    await jumpToMove(index);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent bg="gray.900" color="whiteAlpha.900">
        <ModalHeader>Game history</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={3} maxH="400px" overflowY="auto">
            {history.length === 0 && <Text>No moves recorded yet.</Text>}
            {history.map((move, index) => (
              <Button
                key={`${move.action ?? 'start'}-${index}`}
                justifyContent="space-between"
                variant="ghost"
                borderWidth="1px"
                borderColor="whiteAlpha.200"
                onClick={() => handleJump(index)}
              >
                <Text fontWeight="semibold">{move.description || `Move ${index + 1}`}</Text>
                <Text fontSize="sm" color="whiteAlpha.700">
                  Player {move.player}
                </Text>
              </Button>
            ))}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" mr={3} onClick={() => handleJump(0)} isDisabled={history.length === 0}>
            Go to start
          </Button>
          <Button
            colorScheme="teal"
            onClick={() => handleJump(history.length - 1)}
            isDisabled={history.length === 0}
          >
            Go to end
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default HistoryModal;
